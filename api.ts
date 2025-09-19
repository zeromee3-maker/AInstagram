/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality, GenerateContentResponse } from '@google/genai';

/**
 * Generates an image using the Gemini API.
 * @param apiKey The user's Gemini API key.
 * @param prompt The text prompt for image generation.
 * @param imagePart The image data to be used as input.
 * @returns A promise that resolves to the generated image URL as a base64 string.
 * @throws An error if the API call fails, times out, or returns an invalid response.
 */
export const generateImageFromApi = async (
  apiKey: string,
  prompt: string,
  imagePart: { inlineData: { data: string; mimeType: string; } }
): Promise<string> => {
  if (!apiKey) {
    throw new Error('API key is missing. Please provide your API key.');
  }

  const ai = new GoogleGenAI({ apiKey });

  const TIMEOUT = 90000; // 90 seconds
  
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out')), TIMEOUT)
  );

  let response: GenerateContentResponse;
  try {
    const generationPromise = ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [imagePart, { text: prompt }] },
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
    });
    response = await Promise.race([generationPromise, timeoutPromise]);
  } catch(err) {
    console.error("API Error:", err);
    // Check if the error message indicates an API key issue.
    const errorMessage = err.toString().toLowerCase();
    if (errorMessage.includes('api key not valid') || errorMessage.includes('permission denied')) {
      throw new Error('API key not valid. Please check your key.');
    }
    // Re-throw other errors (like timeout, network issues)
    throw err;
  }


  if (!response || !response.candidates || response.candidates.length === 0) {
    throw new Error('Invalid API response structure. The request may have been blocked.');
  }

  const candidate = response.candidates[0];

  // Add robust checking for the content and parts properties
  if (!candidate.content || !candidate.content.parts) {
    throw new Error('Invalid response structure: no content parts found.');
  }

  // Check for an image part first
  for (const part of candidate.content.parts) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  // If no image, check for a text part to use as a more specific error
  for (const part of candidate.content.parts) {
      if (part.text) {
          throw new Error(`API returned a text response instead of an image: ${part.text}`);
      }
  }

  throw new Error('No image data found in response.');
};