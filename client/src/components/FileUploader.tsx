import { useState } from 'react';
import type { ChangeEvent } from 'react';

interface FileUploaderProps {
  onUpload: (file: File) => Promise<void>;
  allowedTypes?: string[];
}

export function FileUploader({ onUpload, allowedTypes }: FileUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (selected.size > MAX_SIZE) {
        alert('Файл занадто великий (макс. 10МБ)');
        return;
      }
      setFile(selected);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      await onUpload(file);
      setFile(null);
      alert('Завантажено успішно!');
    } catch {
      alert('Помилка при завантаженні');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center">
      <input 
        type="file"
        accept={allowedTypes?.join(',')} 
        onChange={handleFileChange} 
        className="mb-4 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
      />
      {file && (
        <button
          onClick={handleUpload}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
        >
          {loading ? 'Завантаження...' : `Завантажити ${file.name}`}
        </button>
      )}
    </div>
  );
}
