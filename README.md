# LUXEVA Hair — 假发跨境独立站 Demo（支持 PWV 支付）

面向欧美市场的英文假发独立站，零依赖 Node.js 实现，开箱即跑。

## 运行

```bash
node server.js        # 或 npm start
# 打开 http://localhost:3000
```

需要 Node 18+。没有任何 npm 依赖。

## 功能

- **首页**：Hero、品类入口、热销、Glueless 专题、工厂直营介绍、买家评价
- **商品列表**：按品类 / 发质（真人发/化纤）/ 纹理 / 价格筛选，搜索，5 种排序
- **商品详情**：多图、长度 / 密度 / 头围选项实时联动价格、划线价与折扣、预计送达日期、参数表
- **购物车抽屉**：数量增减、包邮进度条
- **结账**：收货地址（17 个国家）、标准/DHL 快递、折扣码（`WELCOME10` 9 折、`HAIR20` 满 $150 8 折）
- **多币种**：USD / EUR / GBP / CAD / AUD，按所选币种向 PWV 下单收款
- **PWV 支付**：跳转收银台 → 签名异步通知（webhook）→ 回跳订单页轮询状态；失败可重新支付

## 价格

参考亚马逊同类商品定价：化纤 cosplay 款 $24.99 起，真人发 Bob $59.99 起，
13x4 HD 蕾丝前置 $89.99–$149.99（按长度每档加价，密度 180% +$15 / 250% +$35）。
修改 `data/catalog.json` 即可调整商品与价格；运费、汇率、优惠码在 `public/js/pricing.js`。

## PWV 支付集成

代码位于 `server/pwv.js`，采用通用的「托管收银台 + 异步通知」模式：

| 步骤 | 说明 |
|---|---|
| 1. 创建支付 | `POST {PWV_API_BASE}/payments`，返回 `payment_id` + `checkout_url` |
| 2. 跳转收银台 | 买家在 PWV 页面完成付款（卡 / PWV Wallet） |
| 3. 异步通知 | PWV 回调 `/api/pwv/webhook`，头部 `X-PWV-Signature: t=..,v1=HMAC-SHA256` |
| 4. 回跳 | 回到 `/#/order/:id`，前端轮询订单状态 |

服务端会：重新计算价格（不信任前端金额）、校验签名与 5 分钟时效、校验金额/币种一致、按事件 ID 去重。

### 沙箱模式（默认）

`PWV_MODE=sandbox` 时内置模拟收银台（`/pwv-sandbox/checkout.html`），无需任何凭证即可演示：

| 测试卡号 | 结果 |
|---|---|
| 4242 4242 4242 4242 | 成功 |
| 5555 5555 5555 4444 | 成功 |
| 4000 0000 0000 0002 | 卡被拒 |
| 4000 0000 0000 9995 | 余额不足 |

有效期任意未来日期，CVC 任意 3 位。PWV Wallet 标签页可模拟扫码成功/取消。

### 切换到正式环境

```bash
PWV_MODE=live \
PWV_API_BASE=https://<PWV 网关地址> \
PWV_MERCHANT_ID=<商户号> \
PWV_API_KEY=<API Key> \
PWV_SECRET=<签名密钥> \
PUBLIC_URL=https://your-domain.com \
node server.js
```

拿到 PWV 官方接口文档后，只需按文档调整 `server/pwv.js` 里的 `toPwvRequest()`、
`createPayment()` 的响应字段映射和 `verifySignature()` 的签名算法。

## 部署到 Vercel

项目已配置好 `vercel.json`：`public/` 作为静态站点，`api/index.js` 作为无服务器函数处理所有 `/api/*` 请求。

```bash
vercel --prod
```

**订单存储**：Vercel 函数没有持久磁盘。请在 Vercel 项目的 Storage / Marketplace 中添加
**Upstash Redis**，它会自动注入 `KV_REST_API_URL` / `KV_REST_API_TOKEN`（或 `UPSTASH_REDIS_REST_*`），
代码检测到后自动改用 Redis。未配置时退回内存存储，实例回收后订单会丢失，仅适合演示。
`/api/config` 返回的 `storage` 字段可查看当前使用的存储（redis / memory / file）。

## 目录

```
server.js              本地 HTTP 服务（静态文件 + API）
api/index.js           Vercel 无服务器入口
server/app.js          API 路由（本地与 Vercel 共用）
server/pwv.js          PWV 支付适配层 + 沙箱模拟器
server/store.js        存储：Upstash Redis / 本地 JSON 文件 / 内存
data/catalog.json      商品与品类
public/                前端（原生 JS 单页应用）
  js/pricing.js        前后端共用的计价规则
  pwv-sandbox/         PWV 沙箱收银台页面
```

## 图片

商品图来自 [Unsplash](https://unsplash.com)（Unsplash License，可免费商用）。正式上线建议换成自家实拍图。
评价内容为演示样例。
