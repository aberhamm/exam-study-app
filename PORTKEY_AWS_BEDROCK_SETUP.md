# Portkey with AWS Bedrock Configuration Guide

This guide helps you configure the application to use AWS Bedrock foundation models through your Perficient Portkey gateway.

## Important: Model Compatibility

Your database contains **1536-dimensional embeddings**. When using AWS Bedrock, you must use a model that generates 1536-dimensional vectors.

> Tip: If you want to trial 1024-dim models like Titan v2, plan to store those vectors in a parallel collection/index while keeping the original 1536-dim set for backward compatibility.

### ✅ Compatible Bedrock Embedding Model

- **Amazon Titan Embeddings v1**: `amazon.titan-embed-text-v1` (1536 dimensions)

### ❌ Incompatible Models

- Amazon Titan Embeddings v2: `amazon.titan-embed-text-v2:0` (1024 or 256 dimensions)
- Cohere Embed English v3: `cohere.embed-english-v3` (1024 dimensions)
- Cohere Embed Multilingual v3: `cohere.embed-multilingual-v3` (1024 dimensions)

**If you use a different dimension model, vector search will fail!**

## Configuration Steps

### 1. Update `.env.local` with AWS Bedrock Settings

```bash
# Portkey Gateway (Perficient)
USE_PORTKEY=false  # Keep false until tests pass
PORTKEY_API_KEY=mxdAPobP+V/jFLDuJqch8qw5PPxm
PORTKEY_BASE_URL=https://portkeygateway.perficient.com/v1

# AWS Bedrock Provider Header
PORTKEY_PROVIDER=@aws-bedrock-use2
# Additional headers (optional; API key header is auto-generated)
# PORTKEY_CUSTOM_HEADERS=x-custom-header:value

# Chat/Explanation Model (Claude Sonnet 4 on Bedrock)
PORTKEY_MODEL=us.anthropic.claude-sonnet-4-20250514-v1:0
PORTKEY_MODEL_CHAT=us.anthropic.claude-sonnet-4-20250514-v1:0
PORTKEY_MODEL_EXPLANATION=us.anthropic.claude-sonnet-4-20250514-v1:0

# Embeddings Model (MUST be 1536 dimensions to match database)
PORTKEY_MODEL_EMBEDDINGS=amazon.titan-embed-text-v1
```

### 2. Available Bedrock Models

#### Claude Models (Chat/Completion)

- `us.anthropic.claude-sonnet-4-20250514-v1:0` - Claude Sonnet 4 (Latest)
- `us.anthropic.claude-3-5-sonnet-20241022-v2:0` - Claude 3.5 Sonnet v2
- `anthropic.claude-3-5-sonnet-20240620-v1:0` - Claude 3.5 Sonnet v1
- `anthropic.claude-3-sonnet-20240229-v1:0` - Claude 3 Sonnet
- `anthropic.claude-3-haiku-20240307-v1:0` - Claude 3 Haiku

#### Titan Embedding Models

- `amazon.titan-embed-text-v1` - **1536 dimensions** ✅ (Use this!)
- `amazon.titan-embed-text-v2:0` - 1024 or 256 dimensions ❌

### 3. Test Configuration

1. **Navigate to Portkey Test Page:**

   ```
   http://localhost:3000/admin/portkey-test
   ```

2. **Run Tests:**

   - Click "Run All Tests"
   - Check that embeddings return 1536 dimensions
   - Verify chat completion works

3. **Review Results:**
   - ✅ All tests should pass with "matches database" message
   - ⚠️ If embeddings show different dimensions, you're using the wrong model

### 4. Enable Portkey

Once tests pass:

1. **Update `.env.local`:**

   ```bash
   USE_PORTKEY=true
   ```

2. **Restart Development Server:**

   ```bash
   npm run dev
   ```

3. **Verify:**
   - Try generating an explanation in the quiz app
   - Check admin logs for Portkey success

## Troubleshooting

### Issue: 404 Status Code

**Cause:** Model name not recognized by Bedrock **Solution:** Use exact Bedrock model IDs from the list above

### Issue: Dimension Mismatch (e.g., 1024 instead of 1536)

**Cause:** Using Titan v2 or Cohere models **Solution:** Switch to `amazon.titan-embed-text-v1`

### Issue: Custom Headers Not Working

**Cause:** Header format incorrect **Solution:** Use exact format:

```bash
PORTKEY_PROVIDER=@aws-bedrock-use2
# PORTKEY_CUSTOM_HEADERS=x-custom-header:value
```

(Keep each header on a single line; the API key header is derived from `PORTKEY_API_KEY`. Use `\n` inside `PORTKEY_CUSTOM_HEADERS` for additional entries.)

### Issue: "Invalid embedding response"

**Cause:** Model doesn't support embeddings or wrong endpoint **Solution:** Ensure using embedding model, not chat model

## Architecture

```
App → Portkey Gateway (Perficient) → AWS Bedrock → Foundation Models
```

1. **App** sends request with model name
2. **Portkey Gateway** receives request with custom header `x-portkey-provider:@aws-bedrock-use2`
3. **AWS Bedrock** processes with specified foundation model
4. **Response** flows back through Portkey with observability/logging

## Benefits

- ✅ Centralized observability through Portkey
- ✅ Cost tracking and usage analytics
- ✅ Request/response logging
- ✅ Fallback and retry logic
- ✅ Enterprise security controls
- ✅ No direct AWS credentials in app code

## Next Steps

1. Complete test page validation
2. Enable Portkey in production
3. Monitor costs in Portkey dashboard
4. Set up alerts for failures/quota limits
