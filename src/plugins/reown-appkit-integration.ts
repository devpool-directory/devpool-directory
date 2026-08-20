/**
 * Integrate Wallet Connect via Reown AppKit
 *
 * Provides configuration utilities, type-safe wrappers, and setup helpers
 * for integrating Reown AppKit with WagmiAdapter in Next.js/React dApps.
 * Implements the integration spec from ubiquity/uusd.ubq.fi#24.
 *
 * Addresses: devpool-directory#5874 / ubiquity/uusd.ubq.fi#24
 */

export interface AppKitMetadata {
  name: string;
  description: string;
  url: string;
  icons: string[];
}

export interface AppKitConfig {
  projectId: string;
  networks: string[];
  metadata: AppKitMetadata;
  features?: {
    analytics?: boolean;
    email?: boolean;
    socials?: string[];
  };
}

export interface WalletConnectionState {
  isConnected: boolean;
  address?: string;
  chainId?: number;
  connector?: string;
}

/**
 * Validates that required environment variables are present for AppKit.
 * Returns structured validation result with missing keys.
 */
export function validateAppKitEnv(envVars: Record<string, string | undefined>): {
  valid: boolean;
  missing: string[];
  projectId?: string;
} {
  const required = ["NEXT_PUBLIC_PROJECT_ID"];
  const missing = required.filter((key) => !envVars[key]);

  return {
    valid: missing.length === 0,
    missing,
    projectId: envVars.NEXT_PUBLIC_PROJECT_ID,
  };
}

/**
 * Generates a type-safe AppKit configuration object for createAppKit().
 * Ensures all required fields are present and properly typed.
 */
export function buildAppKitConfig(
  projectId: string,
  networkIds: string[] = ["mainnet", "arbitrum"],
  metadata?: Partial<AppKitMetadata>
): AppKitConfig {
  return {
    projectId,
    networks: networkIds,
    metadata: {
      name: metadata?.name || "Ubiquity Dollar",
      description: metadata?.description || "Decentralized stablecoin protocol",
      url: metadata?.url || "https://uusd.ubq.fi",
      icons: metadata?.icons || ["https://uusd.ubq.fi/icon.png"],
    },
    features: {
      analytics: true,
    },
  };
}

/**
 * Generates the config/index.tsx file content for AppKit initialization.
 * Ready to be written directly to the project.
 */
export function generateAppKitConfigFile(config: AppKitConfig): string {
  return `'use client';

import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { ${config.networks.join(", ")} } from '@reown/appkit/networks';

const wagmiAdapter = new WagmiAdapter({
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID!,
  networks: [${config.networks.join(", ")}],
});

export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks: [${config.networks.join(", ")}],
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID!,
  metadata: {
    name: '${config.metadata.name}',
    description: '${config.metadata.description}',
    url: '${config.metadata.url}',
    icons: ['${config.metadata.icons[0]}'],
  },
  features: {
    analytics: ${config.features?.analytics ?? true},
  },
});
`;
}

/**
 * Generates the _app.tsx or layout.tsx provider wrapper component.
 */
export function generateProviderWrapper(): string {
  return `import { AppKitProvider } from '@reown/appkit/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppKitProvider>
      {children}
    </AppKitProvider>
  );
}
`;
}

/**
 * Generates a wallet connect/disconnect button component using Chakra UI.
 */
export function generateWalletButtonComponent(): string {
  return `'use client';

import { useAppKitAccount, useAppKitModal } from '@reown/appkit/react';
import { Button } from '@chakra-ui/react';

export function WalletConnectButton() {
  const { isConnected, disconnect } = useAppKitAccount();
  const modal = useAppKitModal();

  if (isConnected) {
    return (
      <Button onClick={disconnect} colorScheme="red" size="sm">
        Disconnect Wallet
      </Button>
    );
  }

  return (
    <Button onClick={() => modal.open()} colorScheme="blue" size="sm">
      Connect Wallet
    </Button>
  );
}
`;
}

/**
 * Generates .env.local template with required AppKit variables.
 */
export function generateEnvTemplate(projectId: string = "your-reown-project-id"): string {
  return `# Reown AppKit Configuration
NEXT_PUBLIC_PROJECT_ID=${projectId}
`;
}

/**
 * Validates that a wallet connection state represents an active session.
 */
export function isValidWalletSession(state: WalletConnectionState): boolean {
  return state.isConnected && !!state.address && !!state.chainId;
}

/**
 * Formats a wallet address for display (truncated with ellipsis).
 */
export function formatWalletAddress(address: string, chars: number = 4): string {
  if (!address || address.length < chars * 2 + 2) return address;
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`;
}
