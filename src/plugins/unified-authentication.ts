/**
 * Unified Authentication via Supabase
 *
 * Implements multi-provider authentication linking GitHub, Google Drive,
 * and Telegram identities through Supabase. Enables cross-platform identity
 * resolution for UbiquityOS event monitoring and user attribution.
 *
 * Addresses: devpool-directory#5841 / ubiquity/.github#124
 */

export interface AuthProvider {
  id: "github" | "google" | "telegram";
  name: string;
  enabled: boolean;
}

export interface UnifiedUser {
  supabaseUserId: string;
  githubUsername?: string;
  githubId?: number;
  googleEmail?: string;
  telegramId?: number;
  telegramUsername?: string;
  linkedAt: number;
}

export interface AuthLinkResult {
  success: boolean;
  provider: AuthProvider["id"];
  userId?: string;
  error?: string;
}

export interface SupabaseAuthConfig {
  url: string;
  anonKey: string;
  redirectUrl: string;
  providers: AuthProvider[];
}

const DEFAULT_PROVIDERS: AuthProvider[] = [
  { id: "github", name: "GitHub", enabled: true },
  { id: "google", name: "Google Drive", enabled: true },
  { id: "telegram", name: "Telegram", enabled: true },
];

/**
 * Validates that required Supabase environment variables are present.
 */
export function validateSupabaseEnv(envVars: Record<string, string | undefined>): {
  valid: boolean;
  missing: string[];
} {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ];
  const missing = required.filter((key) => !envVars[key]);
  return { valid: missing.length === 0, missing };
}

/**
 * Generates Supabase client initialization code for Next.js App Router.
 */
export function generateSupabaseClientCode(): string {
  return `import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
`;
}

/**
 * Generates the sign-in flow component supporting multiple providers.
 * Handles OAuth redirects and Telegram bot token linking.
 */
export function generateSignInComponent(): string {
  return `'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button, VStack, Text, Input } from '@chakra-ui/react';

export function UnifiedSignIn() {
  const [telegramToken, setTelegramToken] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const handleOAuth = async (provider: 'github' | 'google') => {
    setLoading(provider);
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + '/auth/callback' },
    });
    setLoading(null);
  };

  const handleTelegramLink = async () => {
    if (!telegramToken) return;
    setLoading('telegram');
    // Link Telegram identity to current Supabase session
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('user_identities').upsert({
        user_id: user.id,
        provider: 'telegram',
        provider_token: telegramToken,
        linked_at: new Date().toISOString(),
      });
    }
    setLoading(null);
  };

  return (
    <VStack spacing={4} align="stretch">
      <Button onClick={() => handleOAuth('github')} isLoading={loading === 'github'}>
        Sign in with GitHub
      </Button>
      <Button onClick={() => handleOAuth('google')} isLoading={loading === 'google'}>
        Sign in with Google
      </Button>
      <Input
        placeholder="Telegram Bot Token"
        value={telegramToken}
        onChange={(e) => setTelegramToken(e.target.value)}
      />
      <Button onClick={handleTelegramLink} isLoading={loading === 'telegram'}>
        Link Telegram Account
      </Button>
    </VStack>
  );
}
`;
}

/**
 * Generates SQL migration for user_identities table to store linked accounts.
 */
export function generateIdentitiesMigration(): string {
  return `-- Unified Authentication: User Identity Links
CREATE TABLE IF NOT EXISTS user_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'google', 'telegram')),
  provider_id TEXT,
  provider_username TEXT,
  provider_email TEXT,
  provider_token TEXT, -- For Telegram bot token or refresh tokens
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Index for fast lookups by provider identity
CREATE INDEX idx_user_identities_provider ON user_identities(provider, provider_id);
CREATE INDEX idx_user_identities_user ON user_identities(user_id);

-- RLS: Users can only read/write their own identities
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own identities" ON user_identities
  FOR ALL USING (auth.uid() = user_id);
`;
}

/**
 * Resolves a unified user profile from Supabase by querying linked identities.
 */
export async function resolveUnifiedUser(
  supabaseUserId: string,
  fetchFn: (table: string, filter: Record<string, string>) => Promise<Record<string, unknown>[]>
): Promise<UnifiedUser> {
  const identities = await fetchFn("user_identities", { user_id: supabaseUserId });

  const user: UnifiedUser = {
    supabaseUserId,
    linkedAt: Date.now(),
  };

  for (const identity of identities) {
    const provider = identity.provider as string;
    if (provider === "github") {
      user.githubUsername = identity.provider_username as string;
      user.githubId = Number(identity.provider_id);
    } else if (provider === "google") {
      user.googleEmail = identity.provider_email as string;
    } else if (provider === "telegram") {
      user.telegramId = Number(identity.provider_id);
      user.telegramUsername = identity.provider_username as string;
    }
  }

  return user;
}

/**
 * Checks whether a user has all required identity providers linked.
 */
export function isFullyLinked(
  user: UnifiedUser,
  requiredProviders: AuthProvider["id"][] = ["github", "google", "telegram"]
): { complete: boolean; missing: AuthProvider["id"][] } {
  const missing: AuthProvider["id"][] = [];

  for (const provider of requiredProviders) {
    if (provider === "github" && !user.githubUsername) missing.push("github");
    if (provider === "google" && !user.googleEmail) missing.push("google");
    if (provider === "telegram" && !user.telegramId) missing.push("telegram");
  }

  return { complete: missing.length === 0, missing };
}

export { DEFAULT_PROVIDERS };
