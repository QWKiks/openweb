#!/usr/bin/env python3
"""
Local Whisper Server for OpenWeb MCP speech_to_text tool.
Uses faster-whisper for local transcription (no API key needed).

Install dependencies:
  pip install faster-whisper flask

Run:
  python whisper-server.py

API:
  POST /transcribe
    file: audio/video file
    language: optional language code (e.g. 'ru', 'en')
  Returns: {"text": "transcription"}
"""

import os
import sys
import json
import tempfile
import subprocess
from datetime import datetime
from pathlib import Path

# Try to import faster-whisper
try:
    from faster_whisper import WhisperModel
except ImportError:
    print("ERROR: faster-whisper not installed.")
    print("Run: pip install faster-whisper")
    sys.exit(1)

try:
    from flask import Flask, request, jsonify
except ImportError:
    print("ERROR: flask not installed.")
    print("Run: pip install flask")
    sys.exit(1)

app = Flask(__name__)

# Model configuration
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")  # tiny, base, small, medium, large
MODEL_DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")  # cpu or cuda
MODEL_COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8")  # int8, float16, float32

print(f"[Whisper] Loading model: {MODEL_SIZE} on {MODEL_DEVICE} ({MODEL_COMPUTE})...")
model = WhisperModel(MODEL_SIZE, device=MODEL_DEVICE, compute_type=MODEL_COMPUTE)
print("[Whisper] Model loaded!")


def extract_audio(video_path: str, audio_path: str) -> bool:
    """Extract audio from video using ffmpeg."""
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", video_path,
                "-vn", "-acodec", "libmp3lame", "-q:a", "2",
                audio_path
            ],
            capture_output=True,
            text=True,
            timeout=120
        )
        return result.returncode == 0 and os.path.exists(audio_path) and os.path.getsize(audio_path) > 0
    except Exception as e:
        print(f"[Whisper] ffmpeg error: {e}")
        return False


@app.route("/transcribe", methods=["POST"])
def transcribe():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    language = request.form.get("language")

    # Save uploaded file
    suffix = Path(file.filename).suffix or ".mp4"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        file.save(tmp.name)
        input_path = tmp.name

    try:
        # Determine if we need to extract audio
        audio_path = input_path
        if suffix.lower() in [".mp4", ".avi", ".mov", ".mkv", ".webm"]:
            audio_path = input_path + ".mp3"
            print(f"[Whisper] Extracting audio from {suffix}...")
            if not extract_audio(input_path, audio_path):
                return jsonify({"error": "Failed to extract audio with ffmpeg"}), 500

        # Transcribe
        print(f"[Whisper] Transcribing {audio_path} (lang={language})...")
        segments, info = model.transcribe(
            audio_path,
            language=language,
            task="transcribe",
            vad_filter=True,
            condition_on_previous_text=True,
        )

        text_parts = []
        for segment in segments:
            text_parts.append(segment.text.strip())
            print(f"[Whisper] [{segment.start:.2f}s -> {segment.end:.2f}s] {segment.text}")

        transcription = " ".join(text_parts).strip()
        print(f"[Whisper] Done. Length: {len(transcription)} chars")

        # Save transcription to project directory
        try:
            script_dir = Path(__file__).parent.resolve()
            transcriptions_dir = script_dir / "transcriptions"
            transcriptions_dir.mkdir(exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
            safe_name = f"whisper_{timestamp}"
            
            txt_file = transcriptions_dir / f"{safe_name}.txt"
            json_file = transcriptions_dir / f"{safe_name}.json"
            
            txt_file.write_text(transcription, encoding="utf-8")
            json_file.write_text(json.dumps({
                "text": transcription,
                "language": language,
                "timestamp": datetime.now().isoformat(),
                "model": MODEL_SIZE,
            }, ensure_ascii=False, indent=2), encoding="utf-8")
            
            print(f"[Whisper] Saved to: {txt_file}")
        except Exception as e:
            print(f"[Whisper] Warning: Failed to save transcription: {e}")

        return jsonify({"text": transcription})

    finally:
        # Cleanup
        try:
            os.unlink(input_path)
            if audio_path != input_path and os.path.exists(audio_path):
                os.unlink(audio_path)
        except Exception:
            pass


@app.route("/translate", methods=["POST"])
def translate():
    data = request.get_json(force=True)
    text = data.get("text", "")
    from_lang = data.get("from", "en")
    to_lang = data.get("to", "ru")
    
    if not text:
        return jsonify({"error": "No text provided"}), 400
    
    try:
        import argostranslate.package
        import argostranslate.translate
        
        # Auto-download language package if needed
        argostranslate.package.update_package_index()
        available_packages = argostranslate.package.get_available_packages()
        package_to_install = next(
            filter(lambda x: x.from_code == from_lang and x.to_code == to_lang, available_packages)
        , None)
        if package_to_install:
            argostranslate.package.install_from_path(package_to_install.download())
        
        translated = argostranslate.translate.translate(text, from_lang, to_lang)
        return jsonify({"text": translated, "from": from_lang, "to": to_lang})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL_SIZE, "device": MODEL_DEVICE})


if __name__ == "__main__":
    port = int(os.environ.get("WHISPER_PORT", 5000))
    print(f"[Whisper] Server starting on http://127.0.0.1:{port}")
    app.run(host="127.0.0.1", port=port, threaded=True)
