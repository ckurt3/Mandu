import { useState, useCallback, DragEvent } from 'react';
import type { AttachedFile } from '../types';
import { generateId, isTextFile, compressImage } from '../utils';
import { MAX_TEXT_FILE_SIZE } from '../constants';

interface UseFileAttachmentsReturn {
  attachedFiles: AttachedFile[];
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  handleFileDrop: (e: DragEvent<HTMLDivElement>) => void;
  processFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
}

export function useFileAttachments(): UseFileAttachmentsReturn {
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const processFiles = useCallback((files: File[]) => {
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const dataUrl = e.target?.result as string;
          const compressed = await compressImage(dataUrl);
          setAttachedFiles(prev => [...prev, {
            id: generateId(),
            name: file.name,
            type: 'image',
            dataUrl: compressed,
          }]);
        };
        reader.readAsDataURL(file);
      }
      else if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          setAttachedFiles(prev => [...prev, {
            id: generateId(),
            name: file.name,
            type: 'pdf',
            dataUrl,
          }]);
        };
        reader.readAsDataURL(file);
      }
      else if (isTextFile(file)) {
        if (file.size > MAX_TEXT_FILE_SIZE) {
          alert(`File "${file.name}" is too large. Max size is 100KB.`);
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setAttachedFiles(prev => [...prev, {
            id: generateId(),
            name: file.name,
            type: 'text',
            content,
          }]);
        };
        reader.readAsText(file);
      }
    });
  }, []);

  const handleFileDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  }, [processFiles]);

  const removeFile = useCallback((id: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setAttachedFiles([]);
  }, []);

  return {
    attachedFiles,
    isDragging,
    setIsDragging,
    handleFileDrop,
    processFiles,
    removeFile,
    clearFiles,
  };
}
