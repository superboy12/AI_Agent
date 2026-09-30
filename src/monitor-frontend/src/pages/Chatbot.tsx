import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, User, Loader2, Sparkles, Paperclip, X, FileText, Image as ImageIcon, MessageSquare, Settings, Download } from 'lucide-react';

export const Chatbot = () => {
  const [messages, setMessages] = useState<{ role: 'user' | 'bot'; content: string; fileUrl?: string; fileName?: string }[]>([
    { role: 'bot', content: 'Halo! Saya AI Document Assistant. Ada yang bisa saya bantu hari ini?' }
  ]);
  const [input, setInput] = useState('');
  const [provider, setProvider] = useState<'gemini' | 'deepseek'>('gemini');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAttachedFile(e.target.files[0]);
    }
  };

  const removeAttachment = () => {
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !attachedFile) || isLoading) return;

    const userMessage = input.trim();
    const currentFile = attachedFile;
    
    setInput('');
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    setMessages((prev) => [
      ...prev, 
      { role: 'user', content: userMessage, fileName: currentFile?.name }
    ]);
    setIsLoading(true);

    try {
      let data;
      
      if (currentFile) {
        const formData = new FormData();
        formData.append('message', userMessage);
        formData.append('provider', provider);
        formData.append('file', currentFile);
        
        const response = await fetch('/api/chat', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Gagal mengirim file dan pesan.');
        }
        data = await response.json();
      } else {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userMessage, provider }),
        });

        if (!response.ok) {
          throw new Error('Gagal menghubungi server.');
        }
        data = await response.json();
      }

      setMessages((prev) => [...prev, { role: 'bot', content: data.reply }]);
    } catch (error: any) {
      setMessages((prev) => [...prev, { role: 'bot', content: '❌ Terjadi kesalahan: ' + error.message }]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderContent = (content: string, role: string) => {
    const fileRegex = /<file name="([^"]+)">([\s\S]*?)<\/file>/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = fileRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<div key={`text-${lastIndex}`} className="whitespace-pre-wrap">{content.substring(lastIndex, match.index)}</div>);
      }
      
      const fileName = match[1];
      const fileContent = match[2].trim();
      
      const handleDownload = () => {
        const blob = new Blob([fileContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };

      parts.push(
        <div key={`file-${match.index}`} className="my-3 p-3 rounded-md bg-white border border-gray-200 shadow-sm flex items-center justify-between text-gray-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{fileName}</p>
              <p className="text-[11px] text-gray-500">Document File • Ready to download</p>
            </div>
          </div>
          <button 
            onClick={handleDownload}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors shrink-0 ml-2 shadow-sm"
          >
            <Download size={14} /> Download
          </button>
        </div>
      );
      
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push(<div key={`text-${lastIndex}`} className="whitespace-pre-wrap">{content.substring(lastIndex)}</div>);
    }

    return parts;
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-4 animate-in fade-in duration-300">
      
      {/* Page Header (Architect Style) */}
      <div className="bg-white p-4 rounded-sm shadow-[0_2px_10px_rgba(0,0,0,0.05)] border border-gray-100 flex items-center gap-4">
        <div className="w-10 h-10 rounded bg-[#F8E7F9] flex items-center justify-center text-[#E53935]">
          <MessageSquare size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-800">AI Support Chat</h2>
          <p className="text-xs text-gray-500 mt-0.5">This chat interface connects directly to our intelligent models.</p>
        </div>
        <div className="ml-auto flex gap-2">
           <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as 'gemini' | 'deepseek')}
              className="bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium rounded focus:ring-1 focus:ring-slate-500 focus:outline-none block w-32 px-3 py-1.5"
            >
              <option value="gemini">Gemini AI</option>
              <option value="deepseek">Deepseek</option>
            </select>
            <button className="architect-btn bg-slate-800 hover:bg-slate-900 flex items-center gap-2">
              <Settings size={14} /> Options <span className="text-[10px]">▼</span>
            </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="architect-card flex flex-col flex-1 overflow-hidden">
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                
                {/* Avatar */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-slate-700 text-white' 
                    : 'bg-white border border-gray-200 text-slate-700'
                }`}>
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={18} />}
                </div>

                {/* Message Bubble */}
                <div className="flex flex-col gap-1">
                  
                  {msg.fileName && (
                    <div className="flex items-center gap-2 p-2.5 rounded bg-gray-50 border border-gray-200 text-gray-700 max-w-xs shadow-sm mb-1">
                      <div className="w-8 h-8 rounded bg-white border border-gray-100 flex items-center justify-center text-gray-500">
                        {msg.fileName.match(/\.(jpg|jpeg|png|gif)$/i) ? <ImageIcon size={16} /> : <FileText size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate text-gray-800">{msg.fileName}</p>
                        <p className="text-[10px] text-gray-500 uppercase">{msg.fileName.split('.').pop()}</p>
                      </div>
                    </div>
                  )}

                  {msg.content && (
                    <div className={`px-5 py-3 text-[14px] leading-relaxed shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-slate-700 text-white rounded-l-2xl rounded-br-2xl' 
                        : 'bg-[#F5F6FA] text-gray-800 border border-gray-100 rounded-r-2xl rounded-bl-2xl'
                    }`}>
                      <div className="w-full max-w-full overflow-hidden">
                        {renderContent(msg.content, msg.role)}
                      </div>
                    </div>
                  )}
                  
                  <span className={`text-[10px] text-gray-400 mt-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {msg.role === 'user' ? 'You' : 'System'} • Just now
                  </span>
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3 max-w-[80%] flex-row items-end">
                <div className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-slate-700 shrink-0 shadow-sm">
                  <Bot size={18} />
                </div>
                <div className="px-5 py-3 rounded-r-2xl rounded-bl-2xl bg-[#F5F6FA] text-gray-600 border border-gray-100 flex items-center gap-2 text-sm shadow-sm">
                  <Loader2 size={16} className="animate-spin text-slate-600" /> Processing...
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          <form onSubmit={handleSend}>
            
            {attachedFile && (
              <div className="mb-3 flex items-center gap-3 p-2 bg-white border border-gray-200 rounded shadow-sm w-max">
                <div className="w-8 h-8 rounded bg-slate-100 text-slate-600 flex items-center justify-center">
                  {attachedFile.type.startsWith('image/') ? <ImageIcon size={16} /> : <FileText size={16} />}
                </div>
                <div className="pr-2">
                  <p className="text-xs font-semibold text-gray-700 truncate max-w-[200px]">{attachedFile.name}</p>
                  <p className="text-[10px] text-gray-500">{(attachedFile.size / 1024).toFixed(1)} KB</p>
                </div>
                <button 
                  type="button" 
                  onClick={removeAttachment}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="flex-1 bg-white border border-gray-200 rounded-full flex items-center pl-2 shadow-sm focus-within:border-slate-500 focus-within:ring-1 focus-within:ring-slate-500 transition-all">
                
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden" 
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                  title="Attach file"
                >
                  <Paperclip size={18} />
                </button>

                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isLoading}
                  placeholder="Type your message here..."
                  className="flex-1 bg-transparent border-none px-3 py-3 text-sm text-gray-700 focus:outline-none focus:ring-0 placeholder-gray-400"
                />
              </div>
              
              <button
                type="submit"
                disabled={isLoading || (!input.trim() && !attachedFile)}
                className="w-11 h-11 shrink-0 rounded-full bg-slate-800 hover:bg-slate-900 text-white shadow-md flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={18} className="ml-1" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
