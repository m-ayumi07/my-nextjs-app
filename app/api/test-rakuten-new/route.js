// app/api/test-rakuten-new/route.js
// 新しい楽天API（openapi.rakuten.co.jp）のテスト用
// ※ 環境変数の「値」は絶対にレスポンスに含めない

import https from "node:https";

function rakutenRequest(appId, accessKey, keyword) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      applicationId: appId,
      keyword: keyword,
      hits: "1",
      formatVersion: "2",
    });

    const options = {
      hostname: "openapi.rakuten.co.jp",
      path: `/ichibams/api/IchibaItem/Search/20260401?${params}`,
      method: "GET",
      headers: {
        accessKey: accessKey,
        Referer: "https://example.com/",
        "User-Agent": "Node.js",
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

export async function GET() {
  const APP_ID = process.env.RAKUTEN_APP_ID;
  const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;

  const envCheck = {
    RAKUTEN_APP_ID: APP_ID ? `OK (${APP_ID.length}文字)` : "未設定",
    RAKUTEN_ACCESS_KEY: ACCESS_KEY ? `OK (${ACCESS_KEY.length}文字)` : "未設定",
  };

  if (!APP_ID || !ACCESS_KEY) {
    return Response.json({ error: "環境変数が未設定", envCheck }, { status: 500 });
  }

  try {
    const { status, body } = await rakutenRequest(APP_ID, ACCESS_KEY, "ゲーミングマウス");
    const data = JSON.parse(body);

    if (status !== 200) {
      return Response.json({ error: "楽天APIエラー", status, body: data, envCheck });
    }

    const item = data.Items?.[0];
    return Response.json({
      success: true,
      envCheck,
      item: item ? { name: item.itemName, price: item.itemPrice, shop: item.shopName } : null,
    });
  } catch (err) {
    return Response.json({ error: err.message, envCheck }, { status: 500 });
  }
}
