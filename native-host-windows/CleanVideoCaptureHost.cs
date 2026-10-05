using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class ChromeCaptureHost
{
    private static readonly string DefaultDirectory =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Capture");
    private static readonly string ConfigDirectory =
        Environment.GetEnvironmentVariable("CHROME_CAPTURE_CONFIG_DIR") ??
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ChromeCapture");
    private static readonly string ConfigPath = Path.Combine(ConfigDirectory, "settings.json");
    private static readonly JavaScriptSerializer Json = CreateSerializer();

    [STAThread]
    private static void Main()
    {
        try
        {
            Dictionary<string, object> message = ReadMessage();
            string action = GetString(message, "action");
            Dictionary<string, object> response;

            switch (action)
            {
                case "saveCapture":
                    response = SaveCapture(message);
                    break;
                case "getSaveDirectory":
                    response = DirectoryResponse(GetSaveDirectory());
                    break;
                case "chooseSaveDirectory":
                    response = ChooseSaveDirectory();
                    break;
                case "resetSaveDirectory":
                    response = DirectoryResponse(SetSaveDirectory(DefaultDirectory));
                    break;
                case "openSaveDirectory":
                    response = OpenSaveDirectory();
                    break;
                default:
                    throw new InvalidOperationException("Unknown action: " + action);
            }

            WriteMessage(response);
        }
        catch (Exception error)
        {
            WriteMessage(new Dictionary<string, object> {
                { "ok", false },
                { "error", error.Message }
            });
        }
    }

    private static JavaScriptSerializer CreateSerializer()
    {
        JavaScriptSerializer serializer = new JavaScriptSerializer();
        serializer.MaxJsonLength = Int32.MaxValue;
        return serializer;
    }

    private static Dictionary<string, object> ReadMessage()
    {
        Stream input = Console.OpenStandardInput();
        byte[] header = ReadExactly(input, 4);
        int length = BitConverter.ToInt32(header, 0);
        byte[] body = ReadExactly(input, length);
        return Json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(body));
    }

    private static byte[] ReadExactly(Stream stream, int length)
    {
        byte[] buffer = new byte[length];
        int offset = 0;
        while (offset < length)
        {
            int count = stream.Read(buffer, offset, length - offset);
            if (count == 0) throw new EndOfStreamException("Native message ended unexpectedly.");
            offset += count;
        }
        return buffer;
    }

    private static void WriteMessage(Dictionary<string, object> payload)
    {
        byte[] body = Encoding.UTF8.GetBytes(Json.Serialize(payload));
        Stream output = Console.OpenStandardOutput();
        byte[] header = BitConverter.GetBytes(body.Length);
        output.Write(header, 0, header.Length);
        output.Write(body, 0, body.Length);
        output.Flush();
    }

    private static string GetSaveDirectory()
    {
        try
        {
            Dictionary<string, object> config =
                Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(ConfigPath, Encoding.UTF8));
            string configured = GetString(config, "saveDirectory");
            if (!String.IsNullOrWhiteSpace(configured) && Path.IsPathRooted(configured))
                return Path.GetFullPath(configured);
        }
        catch { }
        return DefaultDirectory;
    }

    private static string SetSaveDirectory(string saveDirectory)
    {
        string normalized = Path.GetFullPath(saveDirectory);
        Directory.CreateDirectory(normalized);
        Directory.CreateDirectory(ConfigDirectory);
        File.WriteAllText(
            ConfigPath,
            Json.Serialize(new Dictionary<string, object> { { "saveDirectory", normalized } }),
            Encoding.UTF8
        );
        return normalized;
    }

    private static Dictionary<string, object> ChooseSaveDirectory()
    {
        string current = GetSaveDirectory();
        Directory.CreateDirectory(current);

        using (FolderBrowserDialog dialog = new FolderBrowserDialog())
        {
            dialog.Description = "캡처 이미지를 저장할 폴더를 선택하세요.";
            dialog.RootFolder = Environment.SpecialFolder.MyComputer;
            dialog.SelectedPath = current;
            dialog.ShowNewFolderButton = true;

            if (dialog.ShowDialog() != DialogResult.OK)
            {
                return new Dictionary<string, object> {
                    { "ok", false },
                    { "cancelled", true },
                    { "error", "폴더 선택을 취소했습니다." }
                };
            }
            return DirectoryResponse(SetSaveDirectory(dialog.SelectedPath));
        }
    }

    private static Dictionary<string, object> OpenSaveDirectory()
    {
        string saveDirectory = GetSaveDirectory();
        Directory.CreateDirectory(saveDirectory);
        Process.Start(new ProcessStartInfo {
            FileName = "explorer.exe",
            Arguments = "\"" + saveDirectory + "\"",
            UseShellExecute = true
        });
        return DirectoryResponse(saveDirectory);
    }

    private static Dictionary<string, object> SaveCapture(Dictionary<string, object> message)
    {
        string dataUrl = GetString(message, "dataUrl");
        int comma = dataUrl.IndexOf(',');
        if (comma < 0) throw new InvalidOperationException("Missing media data URL.");
        string metadata = dataUrl.Substring(0, comma).ToLowerInvariant();
        string extension;
        if (metadata == "data:image/png;base64") extension = "png";
        else if (metadata == "data:audio/mpeg;base64") extension = "mp3";
        else throw new InvalidOperationException("Only PNG and MP3 are supported.");
        byte[] image = Convert.FromBase64String(dataUrl.Substring(comma + 1));
        string filename = SanitizeFilename(GetString(message, "filename"), extension);
        string saveDirectory = GetSaveDirectory();
        Directory.CreateDirectory(saveDirectory);
        string outputPath = Uniquify(Path.Combine(saveDirectory, filename));
        File.WriteAllBytes(outputPath, image);

        return new Dictionary<string, object> {
            { "ok", true },
            { "path", outputPath },
            { "saveDirectory", saveDirectory },
            { "bytes", image.Length }
        };
    }

    private static string SanitizeFilename(string filename, string extension)
    {
        string fallback = DateTime.Now.ToString("yyyyMMdd_HHmmss") + "." + extension;
        string safe = Path.GetFileName(String.IsNullOrWhiteSpace(filename) ? fallback : filename);
        foreach (char invalid in Path.GetInvalidFileNameChars()) safe = safe.Replace(invalid, '_');
        if (!safe.EndsWith("." + extension, StringComparison.OrdinalIgnoreCase))
            safe = Path.GetFileNameWithoutExtension(safe) + "." + extension;
        return safe.Length > 180 ? safe.Substring(0, 180) : safe;
    }

    private static string Uniquify(string filePath)
    {
        if (!File.Exists(filePath)) return filePath;
        string directory = Path.GetDirectoryName(filePath);
        string extension = Path.GetExtension(filePath);
        string basename = Path.GetFileNameWithoutExtension(filePath);
        for (int i = 1; i < 1000; i++)
        {
            string candidate = Path.Combine(directory, basename + "_" + i + extension);
            if (!File.Exists(candidate)) return candidate;
        }
        throw new IOException("Could not create a unique filename.");
    }

    private static Dictionary<string, object> DirectoryResponse(string saveDirectory)
    {
        return new Dictionary<string, object> {
            { "ok", true },
            { "path", saveDirectory },
            { "isDefault", String.Equals(saveDirectory, DefaultDirectory, StringComparison.OrdinalIgnoreCase) }
        };
    }

    private static string GetString(Dictionary<string, object> values, string key)
    {
        object value;
        return values != null && values.TryGetValue(key, out value) && value != null ? value.ToString() : "";
    }
}
