import { resolveHelpAppConfig, type Locale } from "@zcode/shared";
import localDefaultAppConfig from "../../../config/default.json" with { type: "json" };

interface ResolveWebCommunityUrlOptions {
  fetchImpl?: typeof fetch;
  localConfig?: unknown;
  endpointOrigin?: string;
}

export async function resolveWebHelpConfig(options: ResolveWebCommunityUrlOptions = {}) {
  // 自建隐私版只读取本地帮助配置，不能由页面操作触发官方配置请求。
  return resolveHelpAppConfig(undefined, options.localConfig ?? localDefaultAppConfig);
}

export async function resolveWebCommunityUrl(
  locale: Locale,
  options: ResolveWebCommunityUrlOptions = {},
): Promise<string | undefined> {
  return (await resolveWebHelpConfig(options)).community_urls?.[locale];
}
