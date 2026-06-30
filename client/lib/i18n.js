import { createContext, useContext } from 'react';

const branding = (window.__RA__ && window.__RA__.branding) || {};

const translations = {
  en: {
    appName: branding.appName || 'Research Agent',
    appFullName: branding.appFullName || 'Research Agent',
    appDescription: branding.appDescription || 'AI-powered research agent for scientific Q&A, literature search, and computational simulation on HPC clusters',
    newChat: 'New Chat',
    sessions: 'Sessions',
    loading: 'Loading...',
    noSessions: 'No saved sessions',
    you: 'You',
    assistant: branding.appName || 'Research Agent',
    thinking: 'Thinking...',
    copy: 'Copy',
    copied: 'Copied!',
    download: 'Download',
    stop: 'Stop',
    send: 'Send',
    up: '\u2191 Up',
    cwdHint: 'Current Working Directory',
    close: 'Close',
    binaryFile: 'Binary file — preview not available.',
    emptyFile: '(empty file)',
    previewTruncated: 'Preview truncated — file exceeds the size limit.',
    arguments: 'Arguments:',
    result: 'Result:',
    model: 'Model',
    inputPlaceholder: 'Ask a research question, search for papers, or set up a simulation...',
    suggestion1: 'Help me set up a VASP relaxation for a silicon unit cell',
    suggestion2: 'What are the latest advances in perovskite solar cell materials?',
    suggestion3: 'Write a Slurm job script for a 4-node DFT calculation',
    suggestion4: 'Compare MD force fields for polymer membrane simulations',
    error: 'Error:',
    confirmTitle: 'Command Requires Approval',
    confirmDesc: 'The assistant wants to run the following shell command:',
    approve: 'Approve',
    approveAll: 'Approve All',
    deny: 'Deny',
    thinkingMode: 'Thinking',
    webSearch: 'Web Search',
    systemModels: 'System',
    yourModels: 'Your Models',
    guideTab: 'Setup Guide',
    settings: 'Settings',
    modelsTab: 'Models',
    usageTab: 'Usage',
    addModel: 'Add Model',
    noUserModels: 'No user models added yet',
    modelDisplayName: 'Display Name',
    endpoint: 'Endpoint URL',
    modelName: 'Model Name',
    token: 'API Token',
    leaveBlankToKeep: 'leave blank to keep',
    useProxy: 'Route Through HTTP Proxy',
    confirmDeleteModel: 'Delete this model?',
    save: 'Save',
    add: 'Add',
    cancel: 'Cancel',
    refresh: 'Refresh',
    messages: 'Messages',
    tokensIn: 'Tokens In',
    tokensOut: 'Tokens Out',
    cost: 'Cost',
    costEstimate: 'Cost',
    errorRate: 'Error Rate',
    aborts: 'Aborts',
    errors: 'Errors',
    messagesPerDay: 'Messages Per Day',
    tokensPerDay: 'Tokens Per Day (In + Out)',
    byModel: 'By Model',
    byAgent: 'By Agent',
    agent: 'Agent',
    toolMix: 'Tool Usage',
    noData: 'No Data',
    duration: 'Duration',
    sessionInfo: 'Session Info',
    sessionNoUsage: 'No usage recorded for this session yet.',
    contextWindow: 'Context Window',
    comingSoon: 'Coming Soon',
  },
  'zh-CN': {
    appName: branding.appNameZh || branding.appName || '\u79d1\u7814\u52a9\u624b',
    appFullName: branding.appNameZh || branding.appFullName || '\u79d1\u7814\u52a9\u624b',
    appDescription: branding.appDescription || 'AI\u79d1\u7814\u52a9\u624b\uff0c\u652f\u6301\u79d1\u7814\u95ee\u7b54\u3001\u6587\u732e\u68c0\u7d22\u4e0e\u8d85\u7b97\u96c6\u7fa4\u4e0a\u7684\u8ba1\u7b97\u6a21\u62df',
    newChat: '\u65b0\u5bf9\u8bdd',
    sessions: '\u4f1a\u8bdd\u8bb0\u5f55',
    loading: '\u52a0\u8f7d\u4e2d...',
    noSessions: '\u6682\u65e0\u4fdd\u5b58\u7684\u4f1a\u8bdd',
    you: '\u4f60',
    assistant: branding.appNameZh || branding.appName || '\u79d1\u7814\u52a9\u624b',
    thinking: '\u601d\u8003\u4e2d...',
    copy: '\u590d\u5236',
    copied: '\u5df2\u590d\u5236',
    download: '\u4e0b\u8f7d',
    stop: '\u505c\u6b62',
    send: '\u53d1\u9001',
    up: '\u2191 \u4e0a\u7ea7',
    cwdHint: '\u5f53\u524d\u5de5\u4f5c\u76ee\u5f55',
    close: '\u5173\u95ed',
    binaryFile: '\u4e8c\u8fdb\u5236\u6587\u4ef6 \u2014 \u65e0\u6cd5\u9884\u89c8\u3002',
    emptyFile: '(\u7a7a\u6587\u4ef6)',
    previewTruncated: '\u9884\u89c8\u5df2\u622a\u65ad \u2014 \u6587\u4ef6\u8d85\u8fc7\u5927\u5c0f\u9650\u5236\u3002',
    arguments: '\u53c2\u6570\uff1a',
    result: '\u7ed3\u679c\uff1a',
    model: '\u6a21\u578b',
    inputPlaceholder: '\u63d0\u95ee\u79d1\u7814\u95ee\u9898\u3001\u641c\u7d22\u6587\u732e\uff0c\u6216\u8bbe\u7f6e\u8ba1\u7b97\u6a21\u62df...',
    suggestion1: '\u5e2e\u6211\u8bbe\u7f6e\u4e00\u4e2a\u7845\u5355\u80de\u7684 VASP \u7ed3\u6784\u5f1b\u8c6b\u8ba1\u7b97',
    suggestion2: '\u9499\u949b\u77ff\u592a\u9633\u80fd\u7535\u6c60\u6750\u6599\u7684\u6700\u65b0\u7814\u7a76\u8fdb\u5c55\u6709\u54ea\u4e9b\uff1f',
    suggestion3: '\u7f16\u5199\u4e00\u4e2a 4\u8282\u70b9 DFT \u8ba1\u7b97\u7684 Slurm \u4f5c\u4e1a\u811a\u672c',
    suggestion4: '\u6bd4\u8f83\u9002\u7528\u4e8e\u805a\u5408\u7269\u819c\u6a21\u62df\u7684 MD \u529b\u573a',
    error: '\u9519\u8bef\uff1a',
    confirmTitle: '\u547d\u4ee4\u9700\u8981\u786e\u8ba4',
    confirmDesc: '\u52a9\u624b\u8bf7\u6c42\u6267\u884c\u4ee5\u4e0b Shell \u547d\u4ee4\uff1a',
    approve: '\u6279\u51c6',
    approveAll: '\u5168\u90e8\u6279\u51c6',
    deny: '\u62d2\u7edd',
    thinkingMode: '\u601d\u8003',
    webSearch: '\u8054\u7f51\u641c\u7d22',
    systemModels: '\u7cfb\u7edf',
    yourModels: '\u6211\u7684\u6a21\u578b',
    guideTab: '\u914d\u7f6e\u6307\u5357',
    settings: '\u8bbe\u7f6e',
    modelsTab: '\u6a21\u578b',
    usageTab: '\u7528\u91cf',
    addModel: '\u6dfb\u52a0\u6a21\u578b',
    noUserModels: '\u5c1a\u672a\u6dfb\u52a0\u81ea\u5b9a\u4e49\u6a21\u578b',
    modelDisplayName: '\u663e\u793a\u540d\u79f0',
    endpoint: '\u7aef\u70b9 URL',
    modelName: '\u6a21\u578b\u540d\u79f0',
    token: 'API \u4ee4\u724c',
    leaveBlankToKeep: '\u7559\u7a7a\u4fdd\u7559\u539f\u503c',
    useProxy: '\u901a\u8fc7 HTTP \u4ee3\u7406\u8def\u7531',
    confirmDeleteModel: '\u786e\u8ba4\u5220\u9664\u6b64\u6a21\u578b\uff1f',
    save: '\u4fdd\u5b58',
    add: '\u6dfb\u52a0',
    cancel: '\u53d6\u6d88',
    refresh: '\u5237\u65b0',
    messages: '\u6d88\u606f',
    tokensIn: '\u8f93\u5165 Token',
    tokensOut: '\u8f93\u51fa Token',
    cost: '\u8d39\u7528',
    costEstimate: '\u8d39\u7528',
    errorRate: '\u9519\u8bef\u7387',
    aborts: '\u4e2d\u6b62',
    errors: '\u9519\u8bef',
    messagesPerDay: '\u6bcf\u65e5\u6d88\u606f\u6570',
    tokensPerDay: '\u6bcf\u65e5 Token \u7528\u91cf\uff08\u8f93\u5165 + \u8f93\u51fa\uff09',
    byModel: '\u6309\u6a21\u578b',
    byAgent: '\u6309\u667a\u80fd\u4f53',
    agent: '\u667a\u80fd\u4f53',
    toolMix: '\u5de5\u5177\u4f7f\u7528',
    noData: '\u6682\u65e0\u6570\u636e',
    duration: '\u65f6\u957f',
    sessionInfo: '\u4f1a\u8bdd\u4fe1\u606f',
    sessionNoUsage: '\u6b64\u4f1a\u8bdd\u5c1a\u672a\u8bb0\u5f55\u7528\u91cf\u3002',
    contextWindow: '\u4e0a\u4e0b\u6587\u7a97\u53e3',
    comingSoon: '\u5373\u5c06\u63a8\u51fa',
  },
};

const LOCALE_STORAGE_KEY = 'ra-locale';

function detectLocale() {
  // Manual override stored from the language selector
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && translations[stored]) return stored;
  } catch {}

  // URL param override
  const params = new URLSearchParams(window.location.search);
  const urlLocale = params.get('lang');
  if (urlLocale && translations[urlLocale]) return urlLocale;

  // Browser language
  const browserLang = navigator.language || navigator.userLanguage || 'en';
  if (browserLang.startsWith('zh')) return 'zh-CN';

  return 'en';
}

const currentLocale = detectLocale();

export function t(key) {
  const dict = translations[currentLocale] || translations.en;
  return dict[key] || translations.en[key] || key;
}

export function getLocale() {
  return currentLocale;
}

export function getAvailableLocales() {
  return [
    { id: 'en', name: 'English' },
    { id: 'zh-CN', name: '中文' },
  ];
}

export function setLocale(locale) {
  if (!translations[locale]) return;
  try { localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch {}
  window.location.reload();
}

export const I18nContext = createContext({ t, locale: currentLocale });

export function useI18n() {
  return useContext(I18nContext);
}
