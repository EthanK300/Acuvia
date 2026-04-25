import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";

const client = new GoogleGenerativeAI(env.geminiKey);

export function getGeminiModel(modelName = "gemini-2.5-flash") {
  return client.getGenerativeModel({ model: modelName });
}
