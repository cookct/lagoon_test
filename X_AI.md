#### Model Capabilities

# Chat Completions

Z.AI provides a standard OpenAI-compatible API for chat completions.

## Prerequisites

* Z.AI Account: You need a Z.AI account to access the API.
* API Key: Create an API key on the [Z.AI Console API Keys Page](https://docs.z.ai/api-reference/introduction).

Set your API key in your environment:

```bash
export ZAI_API_KEY="your_api_key"
```

## API Endpoint

Z.AI Platform's general API endpoint is:
```
https://api.z.ai/api/paas/v4
```

**Note:** When using the GLM Coding Plan, you need to configure the dedicated Coding endpoint:
```
https://api.z.ai/api/coding/paas/v4
```

## Authentication

The Z.AI API uses standard HTTP Bearer authentication:

```
Authorization: Bearer ZAI_API_KEY
```

## Available Models

- `glm-5.1` - Latest GLM 5.1 model
- `glm-5` - GLM 5 model
- `glm-4.7` - GLM 4.7 (standard)
- `glm-4.7-flash` - GLM 4.7 Flash (fast, free tier)
- `glm-4.6` - GLM 4.6 (standard)
- `glm-4.6v-flash` - GLM 4.6V-Flash (fast, free tier)
- `glm-4.6v-flashx` - GLM 4.6V-FlashX (enhanced flash)
- `glm-4.5-flash` - GLM 4.5 Flash (fast, free tier)

## Basic Example (cURL)

```bash
curl -X POST "https://api.z.ai/api/paas/v4/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Accept-Language: en-US,en" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "glm-5.1",
    "messages": [
      { "role": "system", "content": "You are a helpful AI assistant." },
      { "role": "user", "content": "Hello, please introduce yourself." }
    ],
    "temperature": 1.0,
    "stream": true
  }'
```

## Python SDK Example

```python
# Install SDK
# pip install zai-sdk

from zai import ZaiClient

# Initialize client
client = ZaiClient(api_key="YOUR_API_KEY")

# Create chat completion request
response = client.chat.completions.create(
    model="glm-5.1",
    messages=[
        {"role": "system", "content": "You are a helpful AI assistant."},
        {"role": "user", "content": "Hello, please introduce yourself."}
    ]
)

# Get response
print(response.choices[0].message.content)
```

## OpenAI SDK Compatibility

Z.AI is compatible with the OpenAI SDK:

```python
from openai import OpenAI

client = OpenAI(
    api_key="your-Z.AI-api-key",
    base_url="https://api.z.ai/api/paas/v4/"
)

completion = client.chat.completions.create(
    model="glm-5.1",
    messages=[
        {"role": "system", "content": "You are a smart and creative novelist"},
        {"role": "user", "content": "Please write a short fairy tale story"}
    ]
)

print(completion.choices[0].message.content)
```

## Node.js Example

```javascript
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: "your-Z.AI-api-key",
    baseURL: "https://api.z.ai/api/paas/v4/"
});

async function main() {
    const completion = await client.chat.completions.create({
        model: "glm-5.1",
        messages: [
            { role: "system", content: "You are a helpful AI assistant." },
            { role: "user", content: "Hello, please introduce yourself." }
        ]
    });
    console.log(completion.choices[0].message.content);
}

main();
```

## Features

- **Function Calling**: Native OpenAI-style tool calling support
- **Streaming**: Server-sent events for streaming responses
- **Vision**: Image understanding capabilities (on supported models)
- **200K Context**: Large context window support

## Rate Limits

See the Z.AI documentation for current rate limits and pricing.

## More Information

- [Z.AI Documentation](https://docs.z.ai/api-reference/introduction)
- [Z.AI Developer Portal](https://docs.z.ai)
