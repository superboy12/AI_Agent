import { useEffect, useState, useRef } from 'react';
import { socket } from '../socket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Storage() {
  const [storage, setStorage] = useState({
    templates: 0,
    pdfs: 0,
    docxs: 0,
    zips: 0,
    used: '0 MB',
    free: '0 MB',
    largestFile: '-',
    largestTemplate: '-'
  });

  const [templateList, setTemplateList] = useState<any[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplateList(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    socket.on('storage_update', (data) => {
      setStorage(data);
    });
    socket.emit('get_storage');
    fetchTemplates();
    return () => {
      socket.off('storage_update');
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setUploadFile(file);
      setUploadName(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', uploadFile);
    if (uploadName) {
      formData.append('name', uploadName);
    }

    try {
      const res = await fetch('/api/templates/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        alert('Template uploaded successfully!');
        setUploadFile(null);
        setUploadName('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchTemplates();
      } else {
        const err = await res.json();
        alert('Upload failed: ' + err.error);
      }
    } catch (error) {
      console.error(error);
      alert('Upload error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchTemplates();
      } else {
        alert('Delete failed');
      }
    } catch (e) {
      console.error(e);
      alert('Delete error');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Storage Analysis</h2>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Jumlah Template</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{storage.templates}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Jumlah PDF</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{storage.pdfs}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Jumlah DOCX</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{storage.docxs}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Jumlah ZIP</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{storage.zips}</div></CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Storage Terpakai</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-rose-500">{storage.used}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Storage Tersisa</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-500">{storage.free}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">File Terbesar</CardTitle></CardHeader>
          <CardContent><div className="text-sm font-medium">{storage.largestFile}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Template Terbesar</CardTitle></CardHeader>
          <CardContent><div className="text-sm font-medium">{storage.largestTemplate}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Manual Template Upload</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Select File (ZIP, DOCX, XLSX)</label>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" 
                  required 
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Template Name (for !use)</label>
                <input 
                  type="text" 
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
                  placeholder="e.g. DatabaseKu"
                  required
                />
              </div>
              <button 
                type="submit" 
                disabled={isUploading || !uploadFile}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isUploading ? 'Uploading...' : 'Upload Template'}
              </button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registered Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {templateList.length === 0 ? (
                <p className="text-sm text-slate-500">No templates found.</p>
              ) : (
                templateList.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200">
                    <div>
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-slate-500">
                        {t.fileType} • {(t.sizeBytes / 1024 / 1024).toFixed(2)} MB • {t.usageCount} uses
                      </p>
                    </div>
                    <button 
                      onClick={() => handleDelete(t.id)}
                      className="text-xs text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
