'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, XCircle, Circle, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';

type TestResult = {
  test: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  details?: unknown;
  duration?: number;
};

type TestResponse = {
  success: boolean;
  hasErrors: boolean;
  results: TestResult[];
  recommendation: string;
  currentConfig?: PortkeyConfig;
};

type PortkeyConfig = {
  apiKey: string;
  baseUrl: string;
  customHeaders: string;
  provider: string;
  model: string;
  modelChat: string;
  modelExplanation: string;
  modelEmbeddings: string;
};

const defaultConfig: PortkeyConfig = {
  apiKey: 'mxdAPobP+V/jFLDuJqch8qw5PPxm',
  baseUrl: 'https://portkeygateway.perficient.com/v1',
  customHeaders: '',
  provider: '@aws-bedrock-use2',
  model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  modelChat: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  modelExplanation: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  modelEmbeddings: 'amazon.titan-embed-text-v1',
};

export default function PortkeyTestPage() {
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState<TestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state with working Bedrock defaults (matching Claude Code config)
  const [config, setConfig] = useState<PortkeyConfig>(defaultConfig);

  // Load current config from server
  useEffect(() => {
    fetch('/api/admin/portkey-test/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.config) {
          setConfig((prev) => ({
            ...prev,
            ...data.config,
          }));
        }
      })
      .catch((err) => {
        console.error('Failed to load config:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const runTests = async (options: { testEmbeddings: boolean; testChat: boolean }) => {
    setTesting(true);
    setError(null);
    setTestResults(null);

    try {
      const response = await fetch('/api/admin/portkey-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...options,
          config,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Test failed');
      }

      setTestResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setTesting(false);
    }
  };

  const copyEnvConfig = () => {
    const envConfig = `# Portkey Configuration
PORTKEY_API_KEY=${config.apiKey}
PORTKEY_BASE_URL=${config.baseUrl}
PORTKEY_CUSTOM_HEADERS=${config.customHeaders}
PORTKEY_PROVIDER=${config.provider}
PORTKEY_MODEL=${config.model}
PORTKEY_MODEL_CHAT=${config.modelChat}
PORTKEY_MODEL_EXPLANATION=${config.modelExplanation}
PORTKEY_MODEL_EMBEDDINGS=${config.modelEmbeddings}
`;
    navigator.clipboard.writeText(envConfig);
    toast.success('Configuration copied to clipboard!');
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="text-green-600" size={20} />;
      case 'error':
        return <XCircle className="text-red-600" size={20} />;
      case 'skipped':
        return <Circle className="text-gray-400" size={20} />;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin" size={32} />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Portkey Configuration Test</h1>
        <p className="text-muted-foreground">
          Configure and test your Portkey gateway before enabling it in production.
        </p>
      </div>

      <Card className="p-6 mb-6 bg-yellow-50 border-yellow-200">
        <h2 className="text-xl font-semibold mb-3 text-yellow-900">⚠️ AWS Bedrock Model Names</h2>
        <div className="text-sm text-yellow-800 space-y-3">
          <div>
            <p className="font-semibold mb-1">Claude Models (from your Claude Code config):</p>
            <ul className="list-disc list-inside space-y-1 ml-4 font-mono text-xs">
              <li>us.anthropic.claude-sonnet-4-20250514-v1:0 ⭐ (Your working config)</li>
              <li>anthropic.claude-3-5-sonnet-20241022-v2:0 (Claude 3.5 Sonnet v2)</li>
              <li>anthropic.claude-3-5-sonnet-20240620-v1:0 (Claude 3.5 Sonnet v1)</li>
              <li>us.anthropic.claude-3-5-sonnet-20241022-v2:0 (US region)</li>
              <li>anthropic.claude-3-sonnet-20240229-v1:0 (Claude 3 Sonnet)</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-1">Embeddings (MUST be 1536 dims):</p>
            <ul className="list-disc list-inside space-y-1 ml-4 font-mono text-xs">
              <li>amazon.titan-embed-text-v1 ✓ (1536 dims - matches your DB)</li>
              <li className="text-red-700">
                amazon.titan-embed-text-v2:0 ✗ (1024 dims - won&apos;t work!)
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">Required Headers:</p>
            <p className="font-mono text-xs ml-4">x-portkey-api-key (added automatically)</p>
            <p className="font-mono text-xs ml-4">
              x-portkey-provider:@aws-bedrock-use2 (configure below or via environment)
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Configuration</h2>
          <Button
            onClick={copyEnvConfig}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <Copy size={16} />
            Copy as .env
          </Button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="apiKey">API Key *</Label>
              <Input
                id="apiKey"
                type="password"
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                placeholder="mxdAPobP+V/jFLDuJqch8qw5PPxm"
              />
            </div>

            <div>
              <Label htmlFor="baseUrl">Base URL *</Label>
              <Input
                id="baseUrl"
                value={config.baseUrl}
                onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                placeholder="https://portkeygateway.perficient.com/v1"
              />
            </div>

            <div>
              <Label htmlFor="customHeaders">
                Custom Headers (format: key:value, one per line)
              </Label>
              <Textarea
                id="customHeaders"
                value={config.customHeaders}
                onChange={(e) => setConfig({ ...config, customHeaders: e.target.value })}
                placeholder="x-custom-header:value"
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                ⚠️ <span className="font-mono">x-portkey-api-key</span> is generated from the API key
                above. Use this field for any additional headers required by your gateway.
              </p>
            </div>

            <div>
              <Label htmlFor="provider">Provider Header (x-portkey-provider) *</Label>
              <Input
                id="provider"
                value={config.provider}
                onChange={(e) => setConfig({ ...config, provider: e.target.value })}
                placeholder="@aws-bedrock-use2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Required for enterprise gateways (e.g., Perficient). Leave blank for public Portkey
                usage.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="modelChat">Chat Model *</Label>
                <Input
                  id="modelChat"
                  value={config.modelChat}
                  onChange={(e) => setConfig({ ...config, modelChat: e.target.value })}
                  placeholder="anthropic.claude-3-5-sonnet-20241022-v2:0"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Try: anthropic.claude-3-5-sonnet-20241022-v2:0 or
                  anthropic.claude-3-sonnet-20240229-v1:0
                </p>
              </div>

              <div>
                <Label htmlFor="modelExplanation">Explanation Model</Label>
                <Input
                  id="modelExplanation"
                  value={config.modelExplanation}
                  onChange={(e) => setConfig({ ...config, modelExplanation: e.target.value })}
                  placeholder="anthropic.claude-3-5-sonnet-20241022-v2:0"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="modelEmbeddings">Embeddings Model *</Label>
              <Input
                id="modelEmbeddings"
                value={config.modelEmbeddings}
                onChange={(e) => setConfig({ ...config, modelEmbeddings: e.target.value })}
                placeholder="amazon.titan-embed-text-v1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Titan v1 returns 1536 dimensions (matches existing vectors). Titan v2 returns 1024
                dimensions; tests will pass but you must re-embed documents before production use.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Run Tests</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Test the configuration above with your Portkey gateway.
        </p>

        <div className="flex gap-4">
          <Button
            onClick={() => runTests({ testEmbeddings: true, testChat: true })}
            disabled={testing || !config.apiKey}
            className="flex items-center gap-2"
          >
            {testing && <Loader2 className="animate-spin" size={16} />}
            Run All Tests
          </Button>

          <Button
            onClick={() => runTests({ testEmbeddings: true, testChat: false })}
            disabled={testing || !config.apiKey}
            variant="outline"
          >
            Test Embeddings Only
          </Button>

          <Button
            onClick={() => runTests({ testEmbeddings: false, testChat: true })}
            disabled={testing || !config.apiKey}
            variant="outline"
          >
            Test Chat Only
          </Button>
        </div>
      </Card>

      {error && (
        <Card className="p-6 mb-6 border-red-200 bg-red-50">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
          <p className="text-red-700">{error}</p>
        </Card>
      )}

      {testResults && (
        <>
          <Card
            className={`p-6 mb-6 ${
              testResults.success
                ? 'border-green-200 bg-green-50'
                : 'border-yellow-200 bg-yellow-50'
            }`}
          >
            <h3
              className={`text-lg font-semibold mb-2 ${
                testResults.success ? 'text-green-800' : 'text-yellow-800'
              }`}
            >
              {testResults.success ? '✓ All Tests Passed!' : '⚠ Some Tests Failed'}
            </h3>
            <p className={testResults.success ? 'text-green-700' : 'text-yellow-700'}>
              {testResults.recommendation}
            </p>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Test Results</h3>
            <div className="space-y-4">
              {testResults.results.map((result, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    {getStatusIcon(result.status)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-semibold">{result.test}</h4>
                        {result.duration && (
                          <span className="text-xs text-muted-foreground">{result.duration}ms</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{result.message}</p>

                      {result.details != null && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            Show details
                          </summary>
                          <pre className="mt-2 p-3 bg-muted rounded overflow-x-auto">
                            {JSON.stringify(result.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 mt-6 bg-blue-50 border-blue-200">
            <h3 className="text-lg font-semibold text-blue-800 mb-2">Next Steps</h3>
            {testResults.success ? (
              <div className="text-blue-700 space-y-2">
                <p>Your Portkey configuration is working correctly! To enable it:</p>
                <ol className="list-decimal list-inside space-y-1 ml-4">
                  <li>
                    Set <code className="bg-blue-100 px-1 rounded">USE_PORTKEY=true</code> in your{' '}
                    <code className="bg-blue-100 px-1 rounded">.env.local</code>
                  </li>
                  <li>Restart your development server</li>
                  <li>All LLM calls will now route through Portkey</li>
                </ol>
              </div>
            ) : (
              <div className="text-blue-700 space-y-2">
                <p>Review the errors above and check:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>PORTKEY_API_KEY is correct</li>
                  <li>PORTKEY_BASE_URL points to your Perficient gateway</li>
                  <li>PORTKEY_CUSTOM_HEADERS are properly formatted (key:value\\nkey:value)</li>
                  <li>Model names match what your gateway expects</li>
                  <li>Your gateway has access to the specified models</li>
                </ul>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
