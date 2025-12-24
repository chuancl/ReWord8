
import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Play, Globe, ChevronRight, ChevronDown, List, Target, Download, Trash2, Database, Code, Info, Sparkles, Loader2 } from 'lucide-react';
import { Toast, ToastMessage } from './ui/Toast';

interface TreeMapping {
    path: string; // JSON 路径，例如 root.ec.word[0].trs[0]
    field: string; // 映射到的目标字段，如 translation
    isList: boolean; // 是否标记为列表项
}

const TARGET_FIELDS = [
    { value: 'text', label: '单词拼写 (text)' },
    { value: 'translation', label: '中文释义 (translation)' },
    { value: 'phoneticUs', label: '美式音标 (phoneticUs)' },
    { value: 'phoneticUk', label: '英式音标 (phoneticUk)' },
    { value: 'partOfSpeech', label: '词性 (partOfSpeech)' },
    { value: 'englishDefinition', label: '英文定义 (englishDefinition)' },
    { value: 'contextSentence', label: '原句 (contextSentence)' },
    { value: 'dictionaryExample', label: '例句 (dictionaryExample)' },
    { value: 'dictionaryExampleTranslation', label: '例句翻译 (dictionaryExampleTranslation)' },
    { value: 'image', label: '图片链接 (image)' },
];

export const BatchImportConfig: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [apiUrl, setApiUrl] = useState('https://dict.youdao.com/jsonapi?q={word}');
    const [testWord, setTestWord] = useState('book');
    const [fetchedData, setFetchedData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [mappings, setMappings] = useState<TreeMapping[]>([]);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['root']));
    const [toast, setToast] = useState<ToastMessage | null>(null);
    const [generatedPreview, setGeneratedPreview] = useState<any[]>([]);

    const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
        setToast({ id: Date.now(), message, type });
    };

    const handleFetch = async () => {
        if (!apiUrl.includes('{word}')) {
            showToast('URL 必须包含 {word} 占位符', 'error');
            return;
        }
        setIsLoading(true);
        try {
            const url = apiUrl.replace('{word}', encodeURIComponent(testWord));
            const response = await fetch(url);
            if (!response.ok) throw new Error('API 请求失败');
            const data = await response.json();
            setFetchedData(data);
            showToast('数据获取成功', 'success');
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleExpand = (path: string) => {
        const newSet = new Set(expandedPaths);
        if (newSet.has(path)) newSet.delete(path);
        else newSet.add(path);
        setExpandedPaths(newSet);
    };

    const addMapping = (path: string, field: string) => {
        setMappings(prev => {
            const filtered = prev.filter(m => m.path !== path);
            return [...filtered, { path, field, isList: false }];
        });
        showToast(`已映射至 ${field}`, 'info');
    };

    const toggleListMark = (path: string) => {
        setMappings(prev => {
            const existing = prev.find(m => m.path === path);
            if (existing) {
                return prev.map(m => m.path === path ? { ...m, isList: !m.isList } : m);
            }
            return [...prev, { path, field: '', isList: true }];
        });
    };

    const removeMapping = (path: string) => {
        setMappings(prev => prev.filter(m => m.path !== path));
    };

    // --- 数据生成引擎核心逻辑 ---
    const generateData = useCallback(() => {
        if (!fetchedData) return;

        // 1. 查找所有被标记为列表的路径
        const listNodes = mappings.filter(m => m.isList).sort((a, b) => a.path.length - b.path.length);
        
        // 2. 准备映射关系查询
        const getFieldForPath = (p: string) => mappings.find(m => m.path === p)?.field || '';

        const results: any[] = [];

        // 辅助函数：安全获取嵌套值
        const getValueByPath = (obj: any, path: string) => {
            const parts = path.replace('root.', '').split('.');
            let current = obj;
            for (const part of parts) {
                if (current === undefined || current === null) return undefined;
                // 处理数组索引如 word[0]
                const match = part.match(/(.+)\[(\d+)\]/);
                if (match) {
                    current = current[match[1]]?.[parseInt(match[2])];
                } else {
                    current = current[part];
                }
            }
            return current;
        };

        // 简化生成逻辑：处理第一层列表
        // 如果没有标记列表，则只生成一条数据
        if (listNodes.length === 0) {
            const item: any = { addedAt: Date.now(), text: testWord };
            mappings.filter(m => m.field).forEach(m => {
                item[m.field] = getValueByPath(fetchedData, m.path);
            });
            results.push(item);
        } else {
            // 取第一个列表节点作为主循环
            const primaryListPath = listNodes[0].path;
            const rawItems = getValueByPath(fetchedData, primaryListPath);
            const items = Array.isArray(rawItems) ? rawItems : (rawItems ? [rawItems] : []);

            items.forEach((subData, index) => {
                const resultItem: any = { addedAt: Date.now(), text: testWord };
                
                // 处理所有映射
                mappings.forEach(m => {
                    if (!m.field) return;
                    
                    // 如果路径属于当前列表子项
                    if (m.path.startsWith(primaryListPath)) {
                        // 构建子项内部路径
                        // 技巧：如果是列表循环，我们需要根据 index 动态获取
                        const subPathInList = m.path.replace(primaryListPath, '');
                        // subPathInList 可能类似于 .trans 或 .content.sents[0]
                        if (!subPathInList) {
                            resultItem[m.field] = subData;
                        } else {
                            // 递归从子项中取值
                            const localVal = getValueByPath(subData, 'root' + subPathInList);
                            resultItem[m.field] = localVal;
                        }
                    } else {
                        // 否则从全局根获取（继承同级/上级数据）
                        resultItem[m.field] = getValueByPath(fetchedData, m.path);
                    }
                });
                results.push(resultItem);
            });
        }

        setGeneratedPreview(results);
        showToast(`已生成 ${results.length} 条数据预览`, 'success');
    }, [fetchedData, mappings, testWord]);

    useEffect(() => {
        if (fetchedData) generateData();
    }, [fetchedData, mappings, generateData]);

    // --- JSON 树渲染递归组件 ---
    const JsonTreeNode: React.FC<{ data: any, path: string, name: string, depth: number }> = ({ data, path, name, depth }) => {
        const isObject = typeof data === 'object' && data !== null;
        const isArray = Array.isArray(data);
        const isExpanded = expandedPaths.has(path);
        const mapping = mappings.find(m => m.path === path);

        return (
            <div className="ml-4 border-l border-slate-200 pl-4">
                <div className="flex items-center gap-2 py-1 group">
                    {isObject ? (
                        <button onClick={() => toggleExpand(path)} className="text-slate-400 hover:text-blue-500">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                    ) : <div className="w-4" />}

                    <span className="text-sm font-mono text-blue-600 font-bold">{name}:</span>
                    
                    {!isObject && (
                        <span className="text-sm text-slate-500 truncate max-w-[200px]" title={String(data)}>
                            {JSON.stringify(data)}
                        </span>
                    )}

                    {/* 操作菜单 */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                        {isObject && (
                            <button 
                                onClick={() => toggleListMark(path)}
                                className={`p-1 rounded text-[10px] font-bold uppercase transition ${mapping?.isList ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-indigo-100'}`}
                                title="标记为列表项：以此节点为基准进行循环生成"
                            >
                                <List className="w-3 h-3" />
                            </button>
                        )}
                        <select 
                            value={mapping?.field || ''} 
                            onChange={(e) => e.target.value ? addMapping(path, e.target.value) : removeMapping(path)}
                            className={`text-[10px] h-6 border-none rounded bg-slate-100 focus:ring-1 focus:ring-blue-400 ${mapping?.field ? 'bg-blue-500 text-white font-bold' : 'text-slate-400'}`}
                        >
                            <option value="">映射字段...</option>
                            {TARGET_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                        {mapping && (
                            <button onClick={() => removeMapping(path)} className="p-1 text-red-400 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3"/></button>
                        )}
                    </div>
                    
                    {mapping?.isList && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-bold">LIST</span>}
                    {mapping?.field && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">→ {mapping.field}</span>}
                </div>

                {isExpanded && isObject && (
                    <div className="animate-in slide-in-from-top-1 duration-150">
                        {Object.entries(data).map(([key, value]) => (
                            <JsonTreeNode 
                                key={key} 
                                name={key} 
                                data={value} 
                                path={`${path}.${key}`} 
                                depth={depth + 1} 
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const handleDownload = () => {
        const blob = new Blob([JSON.stringify(generatedPreview, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `batch_import_${testWord}_${Date.now()}.json`;
        a.click();
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            <Toast toast={toast} onClose={() => setToast(null)} />
            
            {/* Navbar */}
            <div className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shadow-sm shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition"><ArrowLeft className="w-5 h-5"/></button>
                    <div>
                        <h1 className="text-lg font-bold text-slate-800 flex items-center">
                            <Sparkles className="w-5 h-5 mr-2 text-indigo-500" />
                            智能批导工作台
                        </h1>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest">Advanced API Batch Import Workbench</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={handleDownload} disabled={generatedPreview.length === 0} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-200 transition">
                        <Download className="w-4 h-4 mr-2" /> 导出数据 ({generatedPreview.length})
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left: API Config */}
                <div className="w-80 border-r border-slate-200 bg-white p-6 flex flex-col gap-6 overflow-y-auto shrink-0">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block">API 模板配置</label>
                        <div className="space-y-4">
                            <div>
                                <span className="text-[10px] text-slate-500 mb-1 block">请求地址 (含 {'{word}'})</span>
                                <input 
                                    type="text" 
                                    value={apiUrl} 
                                    onChange={e => setApiUrl(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
                                />
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-500 mb-1 block">测试单词</span>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={testWord} 
                                        onChange={e => setTestWord(e.target.value)}
                                        className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
                                    />
                                    <button 
                                        onClick={handleFetch}
                                        disabled={isLoading}
                                        className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Play className="w-4 h-4 fill-current"/>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-auto p-4 bg-blue-50 rounded-xl border border-blue-100">
                        <div className="flex items-center gap-2 mb-2">
                            <Info className="w-4 h-4 text-blue-500" />
                            <span className="text-xs font-bold text-blue-700">配置指南</span>
                        </div>
                        <ul className="text-[11px] text-blue-600/80 space-y-2 leading-relaxed">
                            <li>1. 请求数据获取 JSON 结构</li>
                            <li>2. 在右侧树中展开并找到目标字段</li>
                            <li>3. <b>标记为列表项</b> 开启循环逻辑</li>
                            <li>4. <b>映射字段</b> 绑定到导入模板</li>
                            <li>5. 同级非列表字段会被分配到列表项内</li>
                        </ul>
                    </div>
                </div>

                {/* Middle: Tree Config */}
                <div className="flex-1 bg-white overflow-y-auto p-8 custom-scrollbar">
                    <div className="max-w-3xl mx-auto">
                        <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-4">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center">
                                <Database className="w-5 h-5 mr-2 text-slate-400" />
                                数据结构映射
                            </h2>
                            <div className="flex gap-4">
                                <div className="flex items-center text-[10px] text-slate-400">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500 mr-1.5"></span> 列表循环点
                                </div>
                                <div className="flex items-center text-[10px] text-slate-400">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 mr-1.5"></span> 已绑定字段
                                </div>
                            </div>
                        </div>

                        {fetchedData ? (
                            <div className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4">
                                <JsonTreeNode data={fetchedData} name="root" path="root" depth={0} />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-32 text-slate-300 border-2 border-dashed border-slate-200 rounded-2xl">
                                <Code className="w-16 h-16 mb-4 opacity-20" />
                                <p>点击左侧“播放”按钮获取 API 数据</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Preview */}
                <div className="w-96 border-l border-slate-200 bg-white p-6 flex flex-col overflow-hidden shrink-0">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex justify-between items-center">
                        生成预览
                        <span className="text-[10px] font-normal text-slate-400 normal-case">{generatedPreview.length} items</span>
                    </label>
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
                        {generatedPreview.length > 0 ? (
                            generatedPreview.map((item, idx) => (
                                <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-mono relative group">
                                    <div className="absolute top-2 right-2 text-[9px] font-bold text-slate-300">#{idx + 1}</div>
                                    <pre className="whitespace-pre-wrap break-all text-slate-600">
                                        {JSON.stringify(item, null, 2)}
                                    </pre>
                                </div>
                            ))
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 italic text-sm text-center px-8">
                                <p>完成映射配置后，这里将实时显示生成的数据。</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
