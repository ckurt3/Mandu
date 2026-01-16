import {
  MAX_IMAGE_DIMENSION,
  IMAGE_QUALITY,
  SUPPORTED_TEXT_EXTENSIONS,
  TOOL_DISPLAY_MAP,
} from './constants';
import type { ToolDisplay } from './types';

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function isTextFile(file: File): boolean {
  if (file.type.startsWith('text/')) return true;
  if (file.type === 'application/json') return true;
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  return SUPPORTED_TEXT_EXTENSIONS.includes(ext);
}

export async function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        if (width > height) {
          height = (height / width) * MAX_IMAGE_DIMENSION;
          width = MAX_IMAGE_DIMENSION;
        } else {
          width = (width / height) * MAX_IMAGE_DIMENSION;
          height = MAX_IMAGE_DIMENSION;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);

      const compressed = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
      resolve(compressed);
    };
    img.src = dataUrl;
  });
}

export function formatToolInput(input: unknown): string {
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    if ('command' in obj) return String(obj.command);
    if ('file_path' in obj) return String(obj.file_path);
    if ('pattern' in obj) return String(obj.pattern);
    if ('query' in obj) return String(obj.query);
    if ('prompt' in obj) return String(obj.prompt).slice(0, 80) + '...';
    if ('collection' in obj) return String(obj.collection);
    if ('title' in obj) return String(obj.title).slice(0, 50);
    if ('name' in obj) return String(obj.name).slice(0, 50);
    return JSON.stringify(input, null, 2);
  }
  return String(input);
}

export function getToolDisplay(name: string, toolInput?: Record<string, unknown>): ToolDisplay {
  // Strip various MCP prefixes
  const baseName = name
    .replace(/^mcp__mandu__/, '')
    .replace(/^mandu__/, '')
    .replace(/^mcp__mongodb__/, '')
    .replace(/^mcp__/, '');

  const tool = TOOL_DISPLAY_MAP[baseName] || TOOL_DISPLAY_MAP[name];
  if (tool) {
    const desc = tool.getDesc && toolInput ? tool.getDesc(toolInput) : '';
    return { ...tool, desc, baseName };
  }

  // Fallback - show truncated but readable name
  return {
    icon: '○',
    label: baseName.replace(/_/g, ' ').toUpperCase().slice(0, 12),
    desc: '',
    textColor: 'text-text-muted',
    bgColor: 'bg-bg-hover',
    baseName,
  };
}
