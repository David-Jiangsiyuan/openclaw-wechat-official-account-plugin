import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";

import { wechatPlugin } from "./dist/channel.js";
import { WeChatConfigSchema } from "./src/config/config-schema.js";

export default {
  id: "wechat",
  name: "WeChat Official Account",
  description: "WeChat Official Account customer service plugin (OAPlugin v2.0)",
  configSchema: buildChannelConfigSchema(WeChatConfigSchema),
  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: wechatPlugin });
  },
};
