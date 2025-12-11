import { GoogleGenAI } from "@google/genai";
import { WorkOrder, MachineModel } from "../types";

// Safety check for browser environment where process might not be defined
const getApiKey = () => {
    try {
        if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
            return process.env.API_KEY;
        }
    } catch (e) {
        // Ignore reference errors
    }
    return '';
};

const GEMINI_API_KEY = getApiKey();

// Safely initialize client
let aiClient: GoogleGenAI | null = null;
try {
    if (GEMINI_API_KEY) {
        aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    } else {
        console.warn("Gemini API Key is missing. AI features will be disabled.");
    }
} catch (error) {
    console.error("Failed to initialize Gemini client:", error);
}

export const generateFactoryInsight = async (orders: WorkOrder[], models: MachineModel[]): Promise<string> => {
  if (!aiClient) return "AI 服务不可用，请检查 API 密钥配置。";

  // Prepare a lightweight context for the AI
  const activeOrders = orders.filter(o => o.status === 'IN_PROGRESS');
  const contextData = {
    totalActive: activeOrders.length,
    orders: activeOrders.map(o => {
      const model = models.find(m => m.id === o.modelId);
      const currentStep = model?.steps[o.currentStepIndex]?.name || 'Unknown';
      const progress = model ? Math.round((o.currentStepIndex / model.steps.length) * 100) : 0;
      return {
        serial: o.id,
        model: model?.name,
        currentStep,
        progress: `${progress}%`,
        startDate: o.startDate,
        ect: o.estimatedCompletionDate
      };
    })
  };

  const prompt = `
    你是一位制造执行系统 (MES) 专家 AI 助手。
    请分析以下代表装配线当前状态的 JSON 数据。
    
    数据: ${JSON.stringify(contextData)}

    请提供一份简明、专业的“轮班报告”（最多 150 字），使用简体中文回答。
    1. 重点指出如果多台机器处于同一步骤可能存在的瓶颈。
    2. 评论整体生产节奏。
    3. 为现场经理提供一条可行的建议。
    不要过度使用 markdown 格式（如加粗），保持文本整洁。
  `;

  try {
    const response = await aiClient.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "未生成分析。";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "由于连接错误，暂时无法生成分析。";
  }
};