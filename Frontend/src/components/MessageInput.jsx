import React, { useEffect, useRef, useState } from "react";

// =====================================================
// API BASE URL
// =====================================================
//
// Local development:
// VITE_API_URL=http://127.0.0.1:8000
//
// Production:
// VITE_API_URL=https://smart-chat-ai-application.onrender.com
//
// =====================================================

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000";

export default function MessageInput({
  onSend,
  onTyping,
  onSendImage,
  onSendVoice,

  // GROUP SUPPORT
  isGroupChat = false,
  groupId = null,

  disabled = false,
}) {
  const [text, setText] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);

  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }

      if (audioStreamRef.current) {
        audioStreamRef.current
          .getTracks()
          .forEach((track) => {
            track.stop();
          });
      }
    };
  }, [imagePreview]);

  // =========================================================
  // TEXT CHANGE
  // =========================================================

  function handleChange(e) {
    const value = e.target.value;

    setText(value);

    if (onTyping) {
      onTyping();
    }
  }

  // =========================================================
  // IMAGE PICKER
  // =========================================================

  function openImagePicker() {
    if (
      disabled ||
      imageUploading ||
      isRecording ||
      voiceUploading
    ) {
      return;
    }

    fileInputRef.current?.click();
  }

  // =========================================================
  // IMAGE SELECT
  // =========================================================

  function handleImageChange(e) {
    const file = e.target.files?.[0];

    e.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  }

  // =========================================================
  // REMOVE IMAGE
  // =========================================================

  function removeSelectedImage() {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setSelectedImage(null);
    setImagePreview("");
  }

  // =========================================================
  // SEND TEXT
  // =========================================================

  async function handleSendText() {
    const trimmed = text.trim();

    if (
      !trimmed ||
      disabled ||
      imageUploading ||
      voiceUploading
    ) {
      return;
    }

    setText("");

    if (onSend) {
      try {
        await onSend(trimmed);
      } catch (error) {
        console.error(
          "Message send error:",
          error
        );
      }
    }
  }

  // =========================================================
  // IMAGE UPLOAD + SEND
  // =========================================================

  async function handleSendImage() {
    if (
      !selectedImage ||
      disabled ||
      imageUploading ||
      voiceUploading
    ) {
      return;
    }

    if (isGroupChat && !groupId) {
      alert("Group information is missing.");
      return;
    }

    try {
      setImageUploading(true);

      const token =
        localStorage.getItem("token");

      if (!token) {
        throw new Error(
          "Authentication token not found."
        );
      }

      // -----------------------------------------------------
      // STEP 1: Upload image
      // -----------------------------------------------------

      const formData = new FormData();

      formData.append(
        "file",
        selectedImage
      );

      const uploadResponse = await fetch(
        `${API_URL}/upload-image`,
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${token}`,
          },

          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        const errorData =
          await uploadResponse
            .json()
            .catch(() => ({}));

        throw new Error(
          errorData.detail ||
            "Image upload failed."
        );
      }

      const uploadData =
        await uploadResponse.json();

      if (
        !uploadData.media_url ||
        !uploadData.media_type
      ) {
        throw new Error(
          "Invalid image upload response."
        );
      }

      // -----------------------------------------------------
      // STEP 2: HAND OFF TO CHAT
      // The parent adds the message optimistically. Do NOT await
      // the backend/AI processing here, otherwise the composer
      // stays locked until the slow AI work finishes.
      // -----------------------------------------------------

      if (onSendImage) {
        const mediaPayload = {
          media_type: uploadData.media_type,
          media_url: uploadData.media_url,
          text: text.trim(),
          isGroupChat,
          groupId,
        };

        Promise.resolve(onSendImage(mediaPayload)).catch((error) => {
          console.error("Image message handoff error:", error);
        });
      }

      // Clear the composer immediately.
      removeSelectedImage();
      setText("");

      // Upload is finished, so the composer can be used again
      // immediately while the message request/AI work continues.
      setImageUploading(false);

    } catch (error) {
      console.error(
        "Image send error:",
        error
      );

      alert(
        error.message ||
          "Failed to send image."
      );

    } finally {
      setImageUploading(false);
    }
  }

  // =========================================================
  // VOICE UPLOAD
  // =========================================================

  async function uploadVoiceFile(
    audioBlob
  ) {
    const formData = new FormData();

    formData.append(
      "file",
      audioBlob,
      "voice-message.webm"
    );

    const token =
      localStorage.getItem("token");

    if (!token) {
      throw new Error(
        "Authentication token not found."
      );
    }

    const response = await fetch(
      `${API_URL}/upload-audio`,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${token}`,
        },

        body: formData,
      }
    );

    if (!response.ok) {
      const errorData =
        await response
          .json()
          .catch(() => ({}));

      throw new Error(
        errorData.detail ||
          "Voice upload failed."
      );
    }

    return response.json();
  }

  // =========================================================
  // VOICE STOP
  // =========================================================

  async function handleVoiceStop() {
    if (!mediaRecorderRef.current) {
      return;
    }

    setIsRecording(false);
    setVoiceUploading(true);

    try {
      if (
        !audioChunksRef.current ||
        audioChunksRef.current.length === 0
      ) {
        throw new Error(
          "No audio was recorded."
        );
      }

      const audioBlob = new Blob(
        audioChunksRef.current,
        {
          type: "audio/webm",
        }
      );

      // -----------------------------------------------------
      // STEP 1: Upload voice
      // -----------------------------------------------------

      const uploadData =
        await uploadVoiceFile(
          audioBlob
        );

      if (
        !uploadData.media_url ||
        !uploadData.media_type
      ) {
        throw new Error(
          "Invalid voice upload response."
        );
      }

      // -----------------------------------------------------
      // STEP 2: HAND OFF TO CHAT
      // Do not await the parent request. The parent adds an
      // optimistic message immediately and the backend handles
      // AI classification separately.
      // -----------------------------------------------------

      if (!onSendVoice) {
        throw new Error(
          "Voice sender is not connected."
        );
      }

      Promise.resolve(
        onSendVoice({
          media_type: uploadData.media_type,
          media_url: uploadData.media_url,
          isGroupChat,
          groupId,
        })
      ).catch((error) => {
        console.error("Voice message handoff error:", error);
      });

      // The file is uploaded and handed off, so release the
      // composer immediately.
      setVoiceUploading(false);

    } catch (error) {
      console.error(
        "Voice send error:",
        error
      );

      alert(
        error.message ||
          "Failed to send voice message."
      );

    } finally {
      setVoiceUploading(false);

      audioChunksRef.current = [];
      mediaRecorderRef.current = null;

      if (audioStreamRef.current) {
        audioStreamRef.current
          .getTracks()
          .forEach((track) => {
            track.stop();
          });

        audioStreamRef.current = null;
      }
    }
  }

  // =========================================================
  // START / STOP RECORDING
  // =========================================================

  async function handleVoiceToggle() {
    if (
      disabled ||
      imageUploading ||
      voiceUploading
    ) {
      return;
    }

    // -----------------------------------------------------
    // STOP
    // -----------------------------------------------------

    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    // -----------------------------------------------------
    // START
    // -----------------------------------------------------

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      audioStreamRef.current =
        stream;

      const recorder =
        new MediaRecorder(stream);

      mediaRecorderRef.current =
        recorder;

      audioChunksRef.current = [];

      recorder.ondataavailable =
        (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(
              event.data
            );
          }
        };

      recorder.onerror = (event) => {
        console.error(
          "MediaRecorder error:",
          event
        );
      };

      recorder.onstop = () => {
        handleVoiceStop();
      };

      recorder.start();

      setIsRecording(true);

    } catch (error) {
      console.error(
        "Microphone access error:",
        error
      );

      alert(
        "Microphone access denied or unavailable."
      );
    }
  }

  // =========================================================
  // SEND
  // =========================================================

  async function handleSend() {
    // -----------------------------------------------------
    // IMAGE
    // -----------------------------------------------------

    if (selectedImage) {
      await handleSendImage();
      return;
    }

    // -----------------------------------------------------
    // VOICE
    // -----------------------------------------------------

    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    // -----------------------------------------------------
    // TEXT
    // -----------------------------------------------------

    await handleSendText();
  }

  // =========================================================
  // ENTER KEY
  // =========================================================

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  // =========================================================
  // UI
  // =========================================================

  return (
    <div className="message-input">

      {/* ===================================================
          HIDDEN IMAGE INPUT
      =================================================== */}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleImageChange}
      />

      {/* ===================================================
          IMAGE BUTTON
      =================================================== */}

      <button
        type="button"
        className="image-btn"
        onClick={openImagePicker}
        disabled={
          disabled ||
          imageUploading ||
          isRecording ||
          voiceUploading
        }
        title="Add image"
      >
        🖼️
      </button>

      {/* ===================================================
          VOICE BUTTON
      =================================================== */}

      <button
        type="button"
        className={`voice-btn ${
          isRecording
            ? "recording"
            : ""
        }`}
        onClick={handleVoiceToggle}
        disabled={
          disabled ||
          imageUploading ||
          voiceUploading
        }
        title={
          isRecording
            ? "Stop recording"
            : "Record voice message"
        }
      >
        {isRecording ? (
          "■"
        ) : (
          <img
            src="/wave-sound.png"
            alt="Voice"
            className="voice-icon"
          />
        )}
      </button>

      {/* ===================================================
          COMPOSER
      =================================================== */}

      <div
        className={`composer-box ${
          selectedImage
            ? "has-image"
            : ""
        }`}
      >

        {/* IMAGE PREVIEW */}

        {selectedImage && (
          <div className="selected-image-preview">

            <img
              src={imagePreview}
              alt="Selected"
            />

            <button
              type="button"
              className="remove-image-btn"
              onClick={
                removeSelectedImage
              }
              disabled={
                imageUploading ||
                voiceUploading
              }
              title="Remove image"
            >
              ×
            </button>

          </div>
        )}

        {/* TEXT INPUT */}

        <input
          type="text"
          placeholder={
            imageUploading
              ? "Sending image..."
              : voiceUploading
              ? "Sending voice..."
              : isRecording
              ? "Recording voice..."
              : selectedImage
              ? "Press send to send image..."
              : "Type a message..."
          }
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={
            disabled ||
            imageUploading ||
            voiceUploading ||
            isRecording
          }
        />

      </div>

      {/* ===================================================
          SEND BUTTON
      =================================================== */}

      <button
        type="button"
        className="send-btn"
        onClick={handleSend}
        disabled={
          disabled ||
          imageUploading ||
          voiceUploading ||
          (
            !selectedImage &&
            !text.trim() &&
            !isRecording
          )
        }
        title={
          selectedImage
            ? "Send image"
            : isRecording
            ? "Stop recording"
            : "Send message"
        }
      >
        {imageUploading ||
        voiceUploading ? (
          "..."
        ) : isRecording ? (
          "■"
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 11L21 3L13 21L10 14L3 11Z"
              fill="currentColor"
            />
          </svg>
        )}
      </button>

    </div>
  );
}
