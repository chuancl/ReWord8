import React, { useState, useEffect, useRef, useMemo } from 'react';
import { WordCategory, WordEntry, MergeStrategyConfig, WordTab, Scenario, AppView } from '../types';
import { DEFAULT_MERGE_STRATEGY } from '../constants';
import { Upload, Download, Filter, Settings2, List, Search, Plus, Trash2, CheckSquare, Square, ArrowRight, BookOpen, GraduationCap, CheckCircle, RotateCcw, FileDown, ChevronDown, Zap } from 'lucide-react';
import { MergeConfigModal } from './word-manager/MergeConfigModal';
import { AddWordModal } from './word-manager/AddWordModal';
import { WordList } from './word-manager/WordList';
import { Toast, ToastMessage } from './ui/Toast';
import { entriesStorage } from '../utils/storage';
import { browser } from 'wxt/browser';

const Tooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
  return (
    <div className="group relative flex items-center">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-slate-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-pre-line text-center shadow-xl leading-relaxed min-w-[120px]">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
      </div>
    </div>
  );
};

const IMPORT_TEMPLATE = [
  {
    "text": "serendipity",
    "translation": "机缘凑巧; 意外发现珍奇事物的本领",
    "phoneticUs": "/ˌsɛrənˈdɪpɪti/",
    "phoneticUk": "/ˌsɛrənˈdɪpɪti/",
    "partOfSpeech": "n.",
    "englishDefinition": "The occurrence and development of events by chance in a happy or beneficial way.",
    "contextSentence": "It was pure serendipity that we met.",
    "contextSentenceTranslation": "我们相遇纯属机缘巧合。",
    "mixedSentence": "It was pure serendipity (机缘巧合) that we met.",
    "dictionaryExample": "Nature has created wonderful things by serendipity.",
    "dictionaryExampleTranslation": "大自然通过机缘巧合创造了奇妙的事物。",
    "inflections": ["serendipities"],
    "tags": ["CET6", "GRE", "Literary"],
    "importance": 3,
    "cocaRank": 15000,
    "phrases": [
      { "text": "pure serendipity", "trans": "纯属巧合" }
    ],
    "roots": [
      { "root": "serendip", "words": [{ "text": "serendipitous", "trans": "偶然的" }] }
    ],
    "synonyms": [
      { "text": "chance", "trans": "机会" },
      { "text": "fluke", "trans": "侥幸" }
    ],
    "image": "",
    "video": {
        "title": "Explanation Video",
        "url": "https://example.com/video.mp4",
        "cover": "https://example.com/cover.jpg"
    },
    "sourceUrl": "https://en.wikipedia.org/wiki/Serendipity"
  }
];

interface WordManagerProps {
  scenarios: Scenario[];
  entries: WordEntry[];
  setEntries: React.Dispatch<React.SetStateAction<WordEntry[]>>;
  ttsSpeed?: number;
  initialTab?: WordTab;
  initialSearchQuery?: string;
  onOpenDetail?: (word: string) => void; 
}

export const WordManager: React.FC<WordManagerProps> = ({ 
    scenarios, 
    entries, 
    setEntries, 
    ttsSpeed = 1.0,
    initialTab,
    initialSearchQuery,
    onOpenDetail
}) => {
  const [activeTab, setActiveTab] = useState<WordTab>('all');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());

  const [isImportDropdownOpen, setIsImportDropdownOpen] = useState(false);
  const importDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      if (initialTab) setActiveTab(initialTab);
      if (initialSearchQuery !== undefined) setSearchQuery(initialSearchQuery);
  }, [initialTab, initialSearchQuery]);

  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [showConfig, setShowConfig] = useState({
    showPhonetic: true,
    showMeaning: true,
  });
  
  const [mergeConfig, setMergeConfig] = useState<MergeStrategyConfig>(DEFAULT_MERGE_STRATEGY);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

  useEffect(() => {
     const savedConfigStr = localStorage.getItem('context-lingo-merge-config');
     if (savedConfigStr) {
         try {
             const saved = JSON.parse(savedConfigStr);
             setMergeConfig(saved);
         } catch (e) {
             setMergeConfig(DEFAULT_MERGE_STRATEGY);
         }
     }
  }, []);

  useEffect(() => {
      localStorage.setItem('context-lingo-merge-config', JSON.stringify(mergeConfig));
  }, [mergeConfig]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (importDropdownRef.current && !importDropdownRef.current.contains(event.target as Node)) {
              setIsImportDropdownOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
      setToast({ id: Date.now(), message, type });
  };

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      if (activeTab !== 'all' && e.category !== activeTab) return false;
      if (selectedScenarioId !== 'all' && e.scenarioId !== selectedScenarioId) return false;
      if (searchQuery) {
        const lowerQ = searchQuery.toLowerCase();
        return e.text.toLowerCase().includes(lowerQ) || e.translation?.toLowerCase().includes(lowerQ);
      }
      return true; 
    });
  }, [entries, activeTab, selectedScenarioId, searchQuery]);

  const groupedEntries = useMemo(() => {
    const groups: Record<string, WordEntry[]> = {};
    filteredEntries.forEach(entry => {
      let key = entry.text.toLowerCase().trim();
      if (mergeConfig.strategy === 'by_word_and_meaning') {
        key = `${key}::${entry.translation?.trim()}`;
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    });
    return Object.values(groups).map(group => group.sort((a, b) => b.addedAt - a.addedAt))
      .sort((a, b) => b[0].addedAt - a[0].addedAt);
  }, [filteredEntries, mergeConfig.strategy]);

  const allVisibleIds = useMemo(() => filteredEntries.map(e => e.id), [filteredEntries]);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedWords.has(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      const newSet = new Set(selectedWords);
      allVisibleIds.forEach(id => newSet.delete(id));
      setSelectedWords(newSet);
    } else {
      const newSet = new Set(selectedWords);
      allVisibleIds.forEach(id => newSet.add(id));
      setSelectedWords(newSet);
    }
  };

  const toggleSelectGroup = (group: WordEntry[]) => {
    const newSet = new Set(selectedWords);
    const groupIds = group.map(g => g.id);
    const isGroupSelected = groupIds.every(id => newSet.has(id));
    if (isGroupSelected) groupIds.forEach(id => newSet.delete(id));
    else groupIds.forEach(id => newSet.add(id));
    setSelectedWords(newSet);
  };

  /* 新增: 辅助函数，用于检查整个组是否被选中 */
  const isGroupSelected = (group: WordEntry[]) => {
    return group.every(e => selectedWords.has(e.id));
  };

  const handleBatchMove = (targetCategory: WordCategory) => {
      const newEntries = entries.map(e => selectedWords.has(e.id) ? { ...e, category: targetCategory } : e);
      setEntries(newEntries);
      setSelectedWords(new Set());
      showToast('操作成功', 'success');
  };

  const handleDownloadTemplate = () => {
      const blob = new Blob([JSON.stringify(IMPORT_TEMPLATE, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'reword_import_template.json';
      a.click();
      setIsImportDropdownOpen(false);
  };

  const handleOpenBatchImportConfig = () => {
      // 跳转到智能批导配置页（新标签页）
      /* 修复: 使用 (browser.runtime as any).getURL 来绕过 WXT 内部的类型缺失错误 */
      const url = (browser.runtime as any).getURL('/options.html?view=batch-import');
      window.open(url, '_blank');
      setIsImportDropdownOpen(false);
  };

  const triggerImport = () => { if (fileInputRef.current) fileInputRef.current.click(); setIsImportDropdownOpen(false); };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col relative min-h-[600px]">
      <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={(e) => {/* 处理导入逻辑 */}} />
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="border-b border-slate-200 px-6 py-5 bg-slate-50 rounded-t-xl flex justify-between items-center flex-wrap gap-4">
        <div><h2 className="text-xl font-bold text-slate-800">词汇库管理</h2><p className="text-sm text-slate-500 mt-1">管理、筛选及编辑您的个性化词库</p></div>
        <button onClick={() => setIsMergeModalOpen(true)} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition shadow-sm"><Settings2 className="w-4 h-4 mr-2" /> 显示配置</button>
      </div>
      
      <AddWordModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onConfirm={async (data) => {/*处理添加*/}} initialCategory={WordCategory.WantToLearnWord}/>
      <MergeConfigModal isOpen={isMergeModalOpen} onClose={() => setIsMergeModalOpen(false)} mergeConfig={mergeConfig} setMergeConfig={setMergeConfig} showConfig={showConfig} setShowConfig={setShowConfig} handleDragStart={() => {}} handleDragOver={() => {}} handleDragEnd={() => {}} draggedItemIndex={null}/>

      <div className="border-b border-slate-200 bg-white p-4 space-y-4">
        <div className="flex overflow-x-auto gap-2 pb-2 hide-scrollbar">
          {(['all', ...Object.values(WordCategory)] as WordTab[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium rounded-full transition-all ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>{tab === 'all' ? '所有单词' : tab}</button>
          ))}
        </div>
        
        <div className="flex flex-wrap gap-4 items-center justify-between bg-slate-50/50 p-3 rounded-xl border border-slate-100">
           <div className="flex items-center gap-4 flex-1">
              <button onClick={toggleSelectAll} className="flex items-center text-sm font-medium text-slate-600 hover:text-slate-900 select-none">{allSelected ? <CheckSquare className="w-5 h-5 mr-2 text-blue-600"/> : <Square className="w-5 h-5 mr-2 text-slate-400"/>}全选</button>
              <div className="flex items-center space-x-2 border-l border-slate-200 pl-4 flex-1 max-w-xs"><Search className="w-4 h-4 text-slate-400" /><input type="text" placeholder="搜索单词或释义..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full text-sm border-none bg-transparent focus:ring-0" /></div>
           </div>

           <div className="flex gap-2 items-center">
              {selectedWords.size > 0 ? (
                 <button onClick={() => handleBatchMove(WordCategory.KnownWord)} className="flex items-center px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-100 rounded-lg hover:bg-green-100 transition"><CheckCircle className="w-4 h-4 mr-2" /> 设为已掌握</button>
              ) : (
                  <div className="relative inline-flex items-stretch" ref={importDropdownRef}>
                      <button onClick={triggerImport} className="flex items-center px-3 py-1.5 text-sm font-bold text-blue-600 bg-white border border-slate-200 rounded-l-lg hover:bg-blue-50 transition-all border-r-0"><Upload className="w-4 h-4 mr-2" /> 批量导入</button>
                      <button onClick={() => setIsImportDropdownOpen(!isImportDropdownOpen)} className={`flex items-center px-1.5 border border-slate-200 rounded-r-lg hover:bg-slate-50 transition-all ${isImportDropdownOpen ? 'bg-slate-100' : 'bg-white'}`}><ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isImportDropdownOpen ? 'rotate-180' : ''}`} /></button>

                      {isImportDropdownOpen && (
                          <div className="absolute top-full right-0 mt-1 w-64 bg-white rounded-xl shadow-2xl border border-slate-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                              <button onClick={handleOpenBatchImportConfig} className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group">
                                  <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 group-hover:bg-indigo-100 transition-colors"><Zap className="w-4 h-4" /></div>
                                  <div className="flex flex-col text-left"><span className="text-sm font-bold text-slate-700">智能批导配置</span><span className="text-[10px] text-slate-400 leading-relaxed mt-0.5">可视化的 API 数据映射工作台。</span></div>
                              </button>
                              <div className="h-px bg-slate-50 my-1 mx-4"></div>
                              <button onClick={handleDownloadTemplate} className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group">
                                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600 group-hover:bg-blue-100 transition-colors"><FileDown className="w-4 h-4" /></div>
                                  <div className="flex flex-col text-left"><span className="text-sm font-bold text-slate-700">下载标准模板</span><span className="text-[10px] text-slate-400 mt-0.5">获取 JSON 格式说明。</span></div>
                              </button>
                          </div>
                      )}
                  </div>
              )}
           </div>
        </div>
      </div>

      <div className="bg-slate-50 p-4 space-y-4 flex-1">
        <WordList groupedEntries={groupedEntries} selectedWords={selectedWords} toggleSelectGroup={toggleSelectGroup} isGroupSelected={isGroupSelected} showConfig={showConfig} mergeConfig={mergeConfig} isAllWordsTab={activeTab === 'all'} searchQuery={searchQuery} ttsSpeed={ttsSpeed} onOpenDetail={onOpenDetail} />
      </div>
    </div>
  );
};