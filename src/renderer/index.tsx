import * as React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [dragOver, setDragOver] = React.useState(false);
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [savedPath, setSavedPath] = React.useState<string | null>(null);

  React.useEffect(() => {
    return () => {
      if (imageSrc && imageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [imageSrc]);

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const file = files[0] as File;
    if (!file.type.startsWith('image/')) {
      alert('Please drop an image file');
      return;
    }

    // Display preview
    const url = URL.createObjectURL(file);
    setImageSrc(url);

    // Read bytes and send to main process to resize + save
    try {
      const arrayBuffer = await file.arrayBuffer();
      // @ts-ignore - electronAPI is injected via preload
      const result = await window.electronAPI.saveImage(file.name, arrayBuffer);
      if (result && result.success) {
        setSavedPath(result.path ?? null);
      } else {
        console.error('Save failed', result?.error);
        alert('Failed to save image: ' + (result?.error || 'unknown'));
      }
    } catch (err) {
      console.error('Failed to send image to main process', err);
      alert('Failed to process dropped image');
    }
  }

  return (
    <div id="app">
      <div
        className={'drop-area' + (dragOver ? ' dragover' : '')}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div style={{ fontSize: 18, color: '#333' }}>
          {imageSrc ? 'Drop another image to replace' : 'Drag an image from your desktop here'}
        </div>
        {imageSrc && <img src={imageSrc} alt="Dropped" />}
        {savedPath && <div style={{ marginTop: 8, color: '#666', fontSize: 12 }}>Saved to: {savedPath}</div>}
      </div>
    </div>
  );
}

// Window electronAPI typing for TS
declare global {
  interface Window {
    electronAPI: {
      saveImage: (name: string, buffer: ArrayBuffer) => Promise<{ success: boolean; path?: string; error?: string }>;
    };
  }
}

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<App />);
} else {
  console.error('Root element not found');
}
