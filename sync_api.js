const axios = require('axios');
const { sha512 } = require('js-sha512');
const { createClient } = require('@supabase/supabase-js');

async function syncErpToSupabase() {
    // 1. API 帳密配置 (維持您剛才測試成功的設定)
    const acc = "301"; 
    const pw = "Jacky301";  
    const key = "GetProductionSummary";
    const url = "https://sales.kencnc.com/sync/get_production_summary/";

    // 2. Supabase 配置 (請填入您的專案資訊)
    const SUPABASE_URL = 'https://vislignuaomyetdkblpc.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpc2xpZ251YW9teWV0ZGtibHBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4ODQxNTIsImV4cCI6MjA4MDQ2MDE1Mn0.lhqEqb3bamJ4--e7nn7UgqZ3J_0nLRI41lmo3Tt9tYI';
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 3. 加密邏輯 (30秒變動一次)
    const timestamp = Math.ceil(Date.now() / 30000); 
    const hash = sha512(`ken_api_${timestamp}${key}${acc}${pw}`);

    console.log("🚀 開始同步至 Supabase (Table: production_order)...");

    try {
        // A. 抓取 ERP 資料
        const response = await axios.post(url, new URLSearchParams({
            "key": key, "acc": acc, "pw": pw, "hash": hash
        }));

        if (response.data.status === "ok") {
            const apiData = response.data.data;
            console.log(`✅ API 認證成功，取得 ${apiData.length} 筆數據`);

            let updateCount = 0;

            // B. 循環更新 Supabase 中的 production_order 表
            for (let item of apiData) {
                const machine_id = item.machine_code;
                const closing_date = item.expect_shipment_date;

                if (!machine_id || !closing_date) continue;

                // C. 執行更新：尋找 id 匹配的行，更新業務結關日
                const { data, error } = await supabase
                    .from('production_order') // <--- 已更新為新的資料表名稱
                    .update({ business_closing_date: closing_date })
                    .eq('id', machine_id);

                if (error) {
                    console.error(`❌ 機台 ${machine_id} 更新失敗:`, error.message);
                } else {
                    console.log(`- [同步中] 機台: ${machine_id} -> 結關日: ${closing_date}`);
                    updateCount++;
                }
            }

            console.log(`\n🎉 同步結束！Supabase 中共有 ${updateCount} 筆資料已更新。`);
        } else {
            console.error("❌ API 認證失敗：", response.data);
        }
    } catch (error) {
        console.error("🚨 執行錯誤：", error.message);
    }
}

syncErpToSupabase();