import React, { useState } from 'react';
import { Database, Download, Copy, Check, RefreshCw, X, ShieldCheck, AlertTriangle, ExternalLink, ChevronDown, ChevronUp, HelpCircle, BookOpen, Activity, Code } from 'lucide-react';
import { 
  type CustomFirebaseConfig, 
  getCustomStoredFirebaseConfig, 
  saveCustomFirebaseConfig, 
  clearCustomFirebaseConfig, 
  downloadEnvFile, 
  generateEnvFileContent,
  testCustomFirebaseConfig
} from '../lib/firebase';

const RECOMMENDED_FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Storage scoped by user ID for Mundus app
    match /users/{userId} {
      allow read, write: if true;

      match /{allSubcollections=**} {
        allow read, write: if true;
      }
    }
  }
}`;

interface FirebaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  errorMessage?: string | null;
}

export const FirebaseConfigModal: React.FC<FirebaseConfigModalProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  errorMessage
}) => {
  if (!isOpen) return null;

  const initialConfig = getCustomStoredFirebaseConfig() || {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    firestoreDatabaseId: '(default)'
  };

  const [config, setConfig] = useState<CustomFirebaseConfig>(initialConfig);
  const [copied, setCopied] = useState(false);
  const [rulesCopied, setRulesCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showRulesBox, setShowRulesBox] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleChange = (field: keyof CustomFirebaseConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value.trim() }));
    setTestResult(null);
  };

  const handleCopyRules = () => {
    navigator.clipboard.writeText(RECOMMENDED_FIRESTORE_RULES);
    setRulesCopied(true);
    setTimeout(() => setRulesCopied(false), 2200);
  };


  const handleTestConnection = async () => {
    if (!config.apiKey.trim() || !config.projectId.trim()) {
      setTestResult({ success: false, message: 'Please enter at least your API Key and Project ID.' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testCustomFirebaseConfig(config);
      setTestResult({
        success: result.success,
        message: result.message || (result.success ? 'Connection successful!' : 'Connection failed.')
      });
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e?.message || 'Error testing Firestore connection.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAndConnect = () => {
    if (!config.apiKey.trim() || !config.projectId.trim()) {
      alert('API Key and Project ID are required to connect Firebase.');
      return;
    }
    saveCustomFirebaseConfig({
      apiKey: config.apiKey.trim(),
      authDomain: config.authDomain.trim(),
      projectId: config.projectId.trim(),
      storageBucket: config.storageBucket?.trim(),
      messagingSenderId: config.messagingSenderId?.trim(),
      appId: config.appId.trim(),
      firestoreDatabaseId: config.firestoreDatabaseId?.trim() || '(default)'
    });
    setSaveSuccess(true);
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  const handleCopyEnv = () => {
    const text = generateEnvFileContent(config);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadEnv = () => {
    downloadEnvFile(config);
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to clear your custom Firebase settings?')) {
      clearCustomFirebaseConfig();
      window.location.reload();
    }
  };

  const isStoredCustom = Boolean(getCustomStoredFirebaseConfig());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div 
        className={`w-full max-w-lg rounded-xl border p-6 shadow-2xl transition-all max-h-[90vh] overflow-y-auto ${
          isDarkMode ? 'bg-[#181818] border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
        }`}
      >
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent/10 text-accent">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Firebase Project Configuration</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Connect your own free 1GB Firebase database or generate a .env configuration file.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Quick Link & Step-by-Step Setup Guide */}
        <div className={`mb-5 rounded-xl border p-3.5 space-y-3 ${
          isDarkMode ? 'bg-neutral-900/70 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
        }`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">Firebase Setup Guide</span>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleCopyRules}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-medium transition-colors cursor-pointer border border-emerald-500/20"
                title="Copy Firestore Security Rules to clipboard"
              >
                {rulesCopied ? <Check className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>{rulesCopied ? 'Rules Copied!' : 'Copy Security Rules'}</span>
              </button>

              <a
                href="https://console.firebase.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent text-xs font-medium transition-colors cursor-pointer"
              >
                <span>Firebase Console</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                  isDarkMode 
                    ? 'border-neutral-700 bg-neutral-800 hover:bg-neutral-750 text-neutral-300' 
                    : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700'
                }`}
              >
                <span>{showGuide ? 'Hide Steps' : 'Step-by-Step Guide'}</span>
                {showGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {showGuide && (
            <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-3 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-300">
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-accent/20 text-accent font-bold text-[10px] shrink-0 mt-0.5">1</span>
                  <p>
                    Go to the <strong><a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-accent underline">Firebase Console</a></strong> and click <strong>&quot;Add project&quot;</strong> (name it anything, e.g. <em>mundus-writer</em>). You can toggle Google Analytics off or on.
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-accent/20 text-accent font-bold text-[10px] shrink-0 mt-0.5">2</span>
                  <p>
                    Inside your project overview, click the <strong>Web icon</strong> (<code>&lt;/&gt;</code>) to register a web app. Give your app a nickname (e.g. <em>Mundus Web</em>) and click <strong>Register app</strong>.
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-accent/20 text-accent font-bold text-[10px] shrink-0 mt-0.5">3</span>
                  <p>
                    Firebase will display your <code>firebaseConfig</code> object. Copy and paste the corresponding values (<strong>apiKey</strong>, <strong>projectId</strong>, <strong>authDomain</strong>, <strong>appId</strong>, etc.) into the form below.
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-accent/20 text-accent font-bold text-[10px] shrink-0 mt-0.5">4</span>
                  <div className="space-y-1.5 flex-1">
                    <p>
                      In the Firebase left sidebar, click <strong>Firestore</strong> under <em>Project shortcuts</em> &rarr; click <strong>Create database</strong> &rarr; choose your region &rarr; select <strong>Rules</strong> tab at top.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-accent/20 text-accent font-bold text-[10px] shrink-0 mt-0.5">5</span>
                  <div className="space-y-1.5 flex-1">
                    <p>
                      Copy the required security rules below, replace all contents in the Firebase <strong>Rules</strong> tab editor with them, and click <strong>Publish</strong>:
                    </p>
                  </div>
                </div>
              </div>

              {/* Firestore Security Rules Box */}
              <div className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-100/70 dark:bg-neutral-900/90 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-neutral-800 dark:text-neutral-200 text-[11px]">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Required Firestore Security Rules</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyRules}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-accent hover:bg-accent/90 text-white text-[11px] font-medium transition-colors cursor-pointer shadow-xs"
                  >
                    {rulesCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{rulesCopied ? 'Rules Copied!' : 'Copy Rules'}</span>
                  </button>
                </div>
                
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  Paste these rules into Firebase Console &rarr; Firestore Database &rarr; Rules:
                </p>

                <div className="relative group">
                  <pre className="p-2.5 rounded-md bg-neutral-950 text-emerald-400 font-mono text-[10.5px] leading-relaxed overflow-x-auto select-all border border-neutral-800">
{RECOMMENDED_FIRESTORE_RULES}
                  </pre>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[11px] space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Direct Database Sync:</span>
                </p>
                <p>
                  Once connected, Mundus automatically writes and synchronizes all your manuscripts, world codex, characters, and timeline directly to your Firestore database without requiring any third-party login or account prompts.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3.5 mb-6 text-xs">
          <div>
            <label className="block font-medium mb-1 text-neutral-600 dark:text-neutral-300">
              API Key <span className="text-red-500">*</span>
            </label>
            <input 
              type="text"
              placeholder="AIzaSy..."
              value={config.apiKey}
              onChange={(e) => handleChange('apiKey', e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent font-mono text-xs focus:outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1 text-neutral-600 dark:text-neutral-300">
                Project ID <span className="text-red-500">*</span>
              </label>
              <input 
                type="text"
                placeholder="my-mundus-project"
                value={config.projectId}
                onChange={(e) => handleChange('projectId', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent font-mono text-xs focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block font-medium mb-1 text-neutral-600 dark:text-neutral-300">
                Auth Domain
              </label>
              <input 
                type="text"
                placeholder="my-mundus-project.firebaseapp.com"
                value={config.authDomain}
                onChange={(e) => handleChange('authDomain', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent font-mono text-xs focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1 text-neutral-600 dark:text-neutral-300">
                App ID <span className="text-red-500">*</span>
              </label>
              <input 
                type="text"
                placeholder="1:123456789:web:abcdef..."
                value={config.appId}
                onChange={(e) => handleChange('appId', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent font-mono text-xs focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-medium text-neutral-600 dark:text-neutral-300">
                  Database ID
                </label>
                <span className="text-[10px] text-neutral-400">Default is (default)</span>
              </div>
              <input 
                type="text"
                placeholder="(default)"
                value={config.firestoreDatabaseId}
                onChange={(e) => handleChange('firestoreDatabaseId', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent font-mono text-xs focus:outline-none focus:border-accent"
              />
              <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">
                * If your Firestore database in Firebase Console has a custom name (e.g. <code>ai-studio-...</code>), enter that exact name here.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1 text-neutral-600 dark:text-neutral-300">
                Storage Bucket <span className="text-neutral-400 font-normal">(Optional)</span>
              </label>
              <input 
                type="text"
                placeholder="my-mundus-project.appspot.com"
                value={config.storageBucket || ''}
                onChange={(e) => handleChange('storageBucket', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent font-mono text-xs focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block font-medium mb-1 text-neutral-600 dark:text-neutral-300">
                Sender ID <span className="text-neutral-400 font-normal">(Optional)</span>
              </label>
              <input 
                type="text"
                placeholder="123456789"
                value={config.messagingSenderId || ''}
                onChange={(e) => handleChange('messagingSenderId', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent font-mono text-xs focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        </div>

        {/* Live Test Connection Result Banner */}
        {testResult && (
          <div className={`mb-4 p-3 rounded-lg border text-xs flex items-start gap-2 ${
            testResult.success 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' 
              : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
          }`}>
            {testResult.success ? (
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 font-medium">{testResult.message}</div>
          </div>
        )}

        <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadEnv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium cursor-pointer transition-colors"
                title="Download .env file for local deployment"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .env</span>
              </button>

              <button
                onClick={handleCopyEnv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium cursor-pointer transition-colors"
                title="Copy formatted .env variables to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy .env'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {isStoredCustom && (
                <button
                  onClick={handleReset}
                  className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 text-xs font-medium cursor-pointer transition-colors"
                  title="Clear custom configuration"
                >
                  <RefreshCw className="w-3.5 h-3.5 inline mr-1" />
                  Reset
                </button>
              )}

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium cursor-pointer transition-colors disabled:opacity-50"
              >
                {isTesting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent" />
                ) : (
                  <Activity className="w-3.5 h-3.5 text-accent" />
                )}
                <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
              </button>

              <button
                onClick={handleSaveAndConnect}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white text-xs font-semibold cursor-pointer transition-colors shadow-sm"
              >
                {saveSuccess ? <ShieldCheck className="w-4 h-4" /> : <Database className="w-4 h-4" />}
                <span>{saveSuccess ? 'Connecting...' : 'Save & Connect'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
