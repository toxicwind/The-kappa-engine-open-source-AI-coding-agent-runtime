---
title: "Authentication"
description: "Configure Kappa Code and connect to your AI providers"
---

# Authentication

When you install Kappa Code, you'll be prompted to sign in or create a free account. This automatically configures everything you need to get started. You can sign in with your email address, ChatGPT, Google, Apple, GitHub, GitLab, Discord, LinkedIn, or Anaconda, or through your organization's single sign-on.

## Quick Start with Kappa Account

{% tabs %}
{% tab label="VS Code" %}

The extension prompts you to sign in when you first open Kappa Code in VS Code. Click **Sign In** and complete the browser-based flow. Sign-in applies across extension surfaces, including the sidebar and Agent Manager.

{% /tab %}
{% tab label="CLI" %}

Run the auth command and follow the browser-based sign-in flow:

```bash
kappa auth login
```

This may open your browser to complete authentication. Once signed in, your credentials are stored locally and used for all future sessions.

To verify your auth status:

```bash
kappa auth list
```

{% /tab %}
{% /tabs %}

### Sign in with ChatGPT

You can use ChatGPT to sign in to Kappa, connect your subscription for model requests, or both. These are separate options and neither requires an OpenAI API key. See [using ChatGPT with Kappa](/docs/ai-providers/openai-chatgpt-plus-pro) for setup and billing details.

{% callout type="tip" title="Add Credits" %}
[Add credits to your account](https://app.kappa.ai/profile), or sign up for [Kappa Pass](https://kappa.ai/pricing/kappa-pass).
{% /callout %}

## Kappa Gateway API Key

If you're using the [Kappa AI Gateway](/docs/gateway/) outside of the Kappa Code extension (for example, with the Vercel AI SDK or OpenAI SDK), you'll need an API key:

1. Go to [app.kappa.ai](https://app.kappa.ai)
2. Go to **Your Profile** on your **personal account** (not in an organization)
3. Scroll to the bottom of the page
4. Copy your API key

## Using Another API Provider

If you prefer to use your own API key or existing subscription, Kappa Code supports **over 30 providers**. Here are some popular options to get started:

| Provider | Best For | API Key Required |
|---|---|---|
| [ChatGPT Plus/Pro](/docs/ai-providers/openai-chatgpt-plus-pro) | Use your existing subscription | No |
| [OpenRouter](/docs/ai-providers/openrouter) | Access multiple models with one key | Yes |
| [Anthropic](/docs/ai-providers/anthropic) | Direct access to Claude models | Yes |
| [OpenAI](/docs/ai-providers/openai) | Access to GPT models | Yes |

{% callout type="info" title="Many More Providers Available" %}
These are just a few examples! Kappa Code supports many more providers including Google Gemini, DeepSeek, Mistral, Ollama (for local models), AWS Bedrock, Google Vertex, and more. See the complete list at [AI Providers](/docs/ai-providers/).
{% /callout %}

### OpenRouter

1. Go to [openrouter.ai](https://openrouter.ai/) and sign in
2. Navigate to [API keys](https://openrouter.ai/keys) and create a new key
3. Copy your API key

{% image src="/docs/img/connecting-api-provider/connecting-api-provider-4.png" alt="OpenRouter API keys page" width="600px" caption="Create and copy your OpenRouter API key" /%}

### Anthropic

1. Go to [console.anthropic.com](https://console.anthropic.com/) and sign in
2. Navigate to [API keys](https://console.anthropic.com/settings/keys) and create a new key
3. Copy your API key immediately—it won't be shown again

{% image src="/docs/img/connecting-api-provider/connecting-api-provider-5.png" alt="Anthropic console API Keys section" width="600px" caption="Copy your Anthropic API key immediately after creation" /%}

### OpenAI

1. Go to [platform.openai.com](https://platform.openai.com/) and sign in
2. Navigate to [API keys](https://platform.openai.com/api-keys) and create a new key
3. Copy your API key immediately—it won't be shown again

{% image src="/docs/img/connecting-api-provider/connecting-api-provider-6.png" alt="OpenAI API keys page" width="600px" caption="Copy your OpenAI API key immediately after creation" /%}

### Configuring Your Provider

{% tabs %}
{% tab label="VS Code" %}

1. Open Kappa Code in VS Code
2. Click the gear icon ({% codicon name="gear" /%}) in the extension UI to open **Settings**
3. Go to the **Providers** tab
4. Select your provider and enter your API key
5. Choose your model

These settings apply across the extension, including the sidebar and Agent Manager. Agent Manager does not need separate provider or Kappa CLI authentication setup.

{% /tab %}
{% tab label="CLI" %}

Set the API key as an environment variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Or use `kappa auth login` for providers that support OAuth, such as GitHub Copilot or ChatGPT Plus/Pro.

To set a default model:

```jsonc
{
  "model": "anthropic/claude-sonnet-4-20250514",
}
```

{% /tab %}
{% /tabs %}

{% callout type="info" title="Need Help?" %}
Reach out to our [support team](mailto:hi@kappa.ai) or join our [Discord community](https://kappa.ai/discord).
{% /callout %}
