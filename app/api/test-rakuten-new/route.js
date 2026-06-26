// app/api/test-rakuten-new/route.js
// 新しい楽天API（openapi.rakuten.co.jp）のテスト用
// ※ 環境変数の「値」は絶対にレスポンスに含めない

export async function GET() {
  const APP_ID = process.env.RAKUTEN_APP_ID;
  const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
  const AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID;

  // 環境変数の存在チェック（値は出さない）
  const envCheck = {
    RAKUTEN_APP_ID: APP_ID ? `OK (${APP_ID.length}文字)` : "未設定",
    RAKUTEN_ACCESS_KEY: ACCESS_KEY ? `OK (${ACCESS_KEY.length}文字)` : "未設定",
    RAKUTEN_AFFILIATE_ID: AFFILIATE_ID ? `OK` : "未設定",
  };

  if (!APP_ID || !ACCESS_KEY) {
    return Response.json({ error: "環境変数が未設定", envCheck }, { status: 500 });
  }

  try {
    const params = new URLSearchParams({
      applicationId: APP_ID,
      keyword: "ゲーミングマウス",
      hits: "1",
      formatVersion: "2",
    });

    const url = `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401?${params}`;

    const res = await fetch(url, {
      headers: {
        accessKey: ACCESS_KEY,
        Referer: "https://my-nextjs-app-chi-woad.vercel.app/",
      },
    });

    const body = await res.text();

    if (!res.ok) {
      return Response.json({
        error: "楽天APIエラー",
        status: res.status,
        body: JSON.parse(body),
        envCheck,
      }, { status: 200 });
    }

    const data = JSON.parse(body);
    const item = data.Items?.[0];

    return Response.json({
      success: true,
      envCheck,
      item: item ? {
        name: item.itemName,
        price: item.itemPrice,
        shop: item.shopName,
      } : null,
    });
  } catch (err) {
    return Response.json({ error: err.message, envCheck }, { status: 500 });
  }
}
