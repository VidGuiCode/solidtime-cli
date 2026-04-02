import type { SolidtimeConfig, SolidtimeAccount } from "./types.js";
import { SolidtimeApiClient } from "./api-client.js";
export declare const DEFAULT_CONFIG: SolidtimeConfig;
export declare function getConfigDir(): string;
export declare function getConfigPath(): string;
export declare function loadConfig(): SolidtimeConfig;
export declare function saveConfig(config: SolidtimeConfig): void;
export declare function getActiveAccount(config: SolidtimeConfig): SolidtimeAccount | undefined;
export declare function requireActiveAccount(config: SolidtimeConfig): SolidtimeAccount;
export declare function requireActiveOrganization(config: SolidtimeConfig): string;
export declare function createClient(config: SolidtimeConfig): SolidtimeApiClient;
//# sourceMappingURL=config-store.d.ts.map