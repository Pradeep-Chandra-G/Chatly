// components/MediaUpload.js
"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Image as ImageIcon, FileText, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export default function MediaUpload({
  onMediaUploaded,
  disabled,
  conversationId,
}) {
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = (type) => {
    if (type === "image") {
      imageInputRef.current?.click();
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      // Pass conversationId for organized folder structure
      if (conversationId) {
        formData.append("conversationId", conversationId);
      }

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (response.ok) {
        onMediaUploaded({
          type: type === "image" ? "image" : "file",
          url: data.url,
          publicId: data.publicId,
          fileName: data.filename,
          fileSize: data.size,
          width: data.width,
          height: data.height,
        });
        toast.success("File uploaded successfully");
      } else {
        toast.error(data.error || "Upload failed");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload file");
    } finally {
      setIsUploading(false);
      // Reset input
      e.target.value = "";
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleFileChange(e, "file")}
        accept=".pdf,.doc,.docx,.txt,.zip,.xlsx,.xls,.ppt,.pptx"
      />
      <input
        ref={imageInputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleFileChange(e, "image")}
        accept="image/*"
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled || isUploading}
          >
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Paperclip className="w-5 h-5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleFileSelect("image")}>
            <ImageIcon className="w-4 h-4 mr-2" />
            Image
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleFileSelect("file")}>
            <FileText className="w-4 h-4 mr-2" />
            Document
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
