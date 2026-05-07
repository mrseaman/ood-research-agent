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
    stop: 'Stop',
    send: 'Send',
    up: '\u2191 Up',
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
    stop: '\u505c\u6b62',
    send: '\u53d1\u9001',
    up: '\u2191 \u4e0a\u7ea7',
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
  },
};

function detectLocale() {
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

export const I18nContext = createContext({ t, locale: currentLocale });

export function useI18n() {
  return useContext(I18nContext);
}
