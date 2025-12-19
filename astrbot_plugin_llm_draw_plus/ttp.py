import requests
import json
import time
import random
import aiohttp
import asyncio
import aiofiles
import base64
import re
from PIL import Image
from io import BytesIO
from astrbot.api import logger

def get_model_suffix(aspect_ratio, image_size, separator="-"):
    # Default to landscape if nothing provided, as per supported models list
    # Supported: landscape, portrait. Square is not explicitly listed, mapping 1:1 to landscape.
    target = "landscape" 

    if aspect_ratio:
        ar_lower = aspect_ratio.lower()
        if ar_lower in ["p", "portrait"]:
            target = "portrait"
        elif ar_lower in ["l", "landscape"]:
            target = "landscape"
        else:
            w, h = 1, 1
            try:
                w, h = map(int, aspect_ratio.split(':'))
                if h > w:
                    target = "portrait"
            except:
                pass
    elif image_size:
        try:
            if "x" in image_size.lower():
                w, h = map(int, image_size.lower().split('x'))
                if h > w:
                    target = "portrait"
        except:
            pass
    
    return f"{separator}{target}"

async def call_flow2api(url, token, payload):
    # Final approach: Use curl via subprocess to bypass potential aiohttp/env issues
    # Use temporary file for payload to avoid "Argument list too long" error with large base64 images
    
    headers = {
        "Content-Type": "application/json"
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    # payload["stream"] = True # Removed: Do not force stream=True, respect caller's setting

    logger.info(f"Calling Flow2API via curl: {url} with model {payload.get('model')}")

    # Create a temporary file for payload
    import tempfile
    import os
    
    try:
        fd, temp_path = tempfile.mkstemp(suffix=".json", text=True)
        response_text = ""
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(payload, f)
                
            # Prepare curl command using @file syntax
            headers_str = " ".join([f"-H '{k}: {v}'" for k, v in headers.items()])
            temp_path_curl = temp_path.replace('\\', '/')
            
            # Use --no-buffer to ensure we get output as it comes (though communicate waits for all)
            # Quote the file path to handle potential spaces or special chars
            # On Windows cmd.exe, single quotes are NOT supported. Use double quotes.
            # However, we're using create_subprocess_shell below, which uses the system shell.
            # Safest is to use double quotes around the URL and the @path, and handle headers carefully.
            # But converting headers to a string with quotes is tricky cross-platform.
            # Let's switch to list arguments + create_subprocess_exec to avoid shell quoting hell.
            
            # NOTE: Previous implementation used shell=True and manual string formatting.
            # Switching to list args is safer and cleaner.
            
            curl_args = ["curl", "-X", "POST", url, "--no-buffer"]
            for k, v in headers.items():
                curl_args.extend(["-H", f"{k}: {v}"])
            
            # curl supports @filename
            curl_args.extend(["-d", f"@{temp_path}"])
            
            # logger.info(f"Executing curl command: {' '.join(curl_args)}") # Masked for security if needed

            proc = await asyncio.create_subprocess_exec(
                *curl_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE)

            stdout, stderr = await proc.communicate()

            if proc.returncode != 0:
                err_msg = stderr.decode().strip()
                logger.error(f"Curl command failed with code {proc.returncode}: {err_msg}")
                if stdout:
                    logger.error(f"Curl stdout: {stdout.decode().strip()}")
                return f"Error: Curl failed - {err_msg}"

            response_text = stdout.decode().strip()
        finally:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except:
                    pass
        
        # Log full response for debugging
        if len(response_text) < 2000:
            logger.info(f"Curl Response: {response_text}")
        else:
            logger.info(f"Curl Response (first 2000 chars): {response_text[:2000]}")

        # Write debug log to file
        try:
            log_dir = os.path.dirname(os.path.abspath(__file__))
            log_path = os.path.join(log_dir, "debug.log")
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(f"\n--- {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n")
                f.write(f"URL: {url}\n")
                f.write(f"Response:\n{response_text}\n")
        except Exception as e:
            logger.warning(f"Failed to write debug log: {e}")

        full_content = ""
        
        # 1. Try parsing as standard JSON first (Non-streaming error or success)
        try:
            data_json = json.loads(response_text)
            if 'error' in data_json:
                error_detail = data_json['error']
                if isinstance(error_detail, dict) and 'message' in error_detail:
                    return f"Error from API: {error_detail['message']}"
                return f"Error from API: {data_json['error']}"
            
            # Check for standard chat completion response
            if 'choices' in data_json and len(data_json['choices']) > 0:
                message = data_json['choices'][0].get('message', {})
                content = message.get('content', '')
                if content:
                    full_content = content
                
                # Check for non-standard 'images' field in message (Gemini/Flow specific)
                # Gemini returns multiple images (1K and 2K), take the LAST one (highest resolution)
                images = message.get('images', [])
                if images and len(images) > 0:
                    image_url = images[-1].get('image_url', {}).get('url')
                    if image_url:
                        return image_url

            # Check for image generation response (DALL-E style)
            elif 'data' in data_json and len(data_json['data']) > 0:
                url_res = data_json['data'][0].get('url')
                if url_res:
                    return url_res
        except json.JSONDecodeError:
            # Not a simple JSON object, likely SSE stream or raw text
            pass

        # 2. If not standard JSON, try parsing as SSE stream
        if not full_content:
            for line in response_text.splitlines():
                line = line.strip()
                if line.startswith('data: ') and line != 'data: [DONE]':
                    json_str = line[6:]
                    try:
                        chunk = json.loads(json_str)
                        if 'choices' in chunk and len(chunk['choices']) > 0:
                            delta = chunk['choices'][0].get('delta', {})
                            content = delta.get('content', '')
                            if content:
                                full_content += content
                            
                            # Check for 'images' in delta (Gemini/Flow specific in SSE)
                            # Take the LAST image for highest resolution
                            images = delta.get('images', [])
                            if images and len(images) > 0:
                                image_url = images[-1].get('image_url', {}).get('url')
                                if image_url:
                                    return image_url
                            
                            reasoning = delta.get('reasoning_content', '')
                            if reasoning:
                                logger.info(f"Flow2API Reasoning: {reasoning}")
                                if "❌" in reasoning or "Error" in reasoning or "失败" in reasoning:
                                    full_content += f"\n[Reasoning Error]: {reasoning}"
                    except json.JSONDecodeError:
                        pass

        # URL Extraction logic remains the same
        md_match = re.search(r'!\[.*?\]\((https?://.*?)\)', full_content)
        if md_match:
            return md_match.group(1)
        
        video_match = re.search(r"<video[^>]+src=['\"](https?://[^'\"]+)['\"]", full_content)
        if video_match:
            return video_match.group(1)

        url_match = re.search(r'(https?://[^\s)"\'<>]+)', full_content)
        if url_match:
            return url_match.group(1)
        
        if full_content:
            # If no URL found but we have content, return the content as error message
            # This helps user understand why image generation failed (e.g. model refusal or chat response)
            return f"No URL found in response. Model Output: {full_content[:500]}"
        
        # If we have a non-empty response text but couldn't parse it as JSON or SSE,
        # it's likely a raw error message (e.g. "unknown provider...")
        if response_text and len(response_text.strip()) > 0:
            return f"API Error: {response_text.strip()[:200]}"

        return "Empty response from Flow2API"

    except Exception as e:
        logger.error(f"Subprocess/Curl execution exception: {e}")
        return f"Exception: {e}"

async def generate_image(prompt, google_api_key=None, model=None, image_size="1024x1024", input_images_b64: list = None, resolution=None, aspect_ratio=None, flow_api_url=None, flow_api_token=None, provider=None, seed=None):
    
    # provider: 'flow', 'official', 'openai'
    
    flow_error = None
    use_flow = False
    use_openai = False
    
    if provider == 'flow':
        use_flow = True
    elif provider == 'openai':
        use_openai = True
    elif provider == 'official':
        use_flow = False
    else:
        # Default behavior: Try Flow if configured
        use_flow = bool(flow_api_url)

    # 1. Try OpenAI Compatible API (New)
    if use_openai and flow_api_url:
        # Construct payload for OpenAI compatible endpoint (e.g. CLIProxyAPI)
        # Supports gemini-3-pro-image-preview with image_config
        
        messages = []
        user_content = []
        
        # Add images if any
        if input_images_b64:
            for b64 in input_images_b64:
                img_url = b64 if b64.startswith("data:") else f"data:image/jpeg;base64,{b64}"
                user_content.append({
                    "type": "image_url",
                    "image_url": {"url": img_url}
                })

        # Add text prompt
        # Enforce image generation instruction to prevent model from just chatting
        enforced_prompt = prompt + "\n\n(IMPORTANT: You are an image generation model. Please generate an image based on the prompt. Do not describe it, just output the image link.)"
        user_content.append({"type": "text", "text": enforced_prompt})
        
        messages.append({"role": "user", "content": user_content})
        
        payload = {
            "model": model, # e.g. gemini-3-pro-image-preview
            "messages": messages,
            "stream": False # Disable streaming for image generation to ensure full response
        }

        # Add image_config for aspect ratio and resolution
        image_config = {}
        if aspect_ratio:
            # Map common ARs if needed, or pass through
            # CLIProxyAPI supports "16:9", "1:1", etc. directly
            image_config["aspect_ratio"] = aspect_ratio
        
        if resolution:
            # Map resolution to image_size (e.g. "4K")
            # Gemini 3 Pro typically expects: "1K", "2K", "4K" (String)
            res_upper = resolution.upper()
            if res_upper in ["1K", "2K", "4K"]:
                image_config["image_size"] = res_upper
            else:
                # Try to map common variations
                if "4K" in res_upper: image_config["image_size"] = "4K"
                elif "2K" in res_upper: image_config["image_size"] = "2K"
                elif "1K" in res_upper: image_config["image_size"] = "1K"
            
        if image_config:
            payload["image_config"] = image_config

        try:
            result = await call_flow2api(flow_api_url, flow_api_token, payload)
            
            if result:
                if result.startswith("http"):
                    image_url = result
                    # Download to local path
                    try:
                        async with aiohttp.ClientSession() as session:
                            async with session.get(image_url) as img_response:
                                if img_response.status == 200:
                                    image_path = 'downloaded_image.jpeg'
                                    image_data = await img_response.read()
                                    async with aiofiles.open(image_path, 'wb') as f:
                                        await f.write(image_data)
                                    
                                    # Get real image size
                                    real_size = "Unknown"
                                    try:
                                        with Image.open(BytesIO(image_data)) as img:
                                            real_size = f"{img.width}x{img.height}"
                                    except Exception: pass
    
                                    # Construct detailed source info
                                    source_info = f"OpenAI Compatible ({model})"
                                    source_info += f" | AR: {aspect_ratio if aspect_ratio else 'Default'}"
                                    source_info += f" | Res: {resolution if resolution else 'Default'} ({real_size})"
                                    return image_url, image_path, source_info
                                else:
                                    flow_error = f"OpenAI API generated URL but download failed: {img_response.status}"
                    except Exception as e:
                        flow_error = f"OpenAI API download exception: {e}"
                        logger.error(f"Failed to download OpenAI API image: {e}")
                elif result.startswith("data:image"):
                    # Handle base64 data URI directly
                    try:
                        # Extract base64 part
                        header, b64_data = result.split(',', 1)
                        image_data = base64.b64decode(b64_data)
                        image_path = 'downloaded_image.jpeg'
                        async with aiofiles.open(image_path, 'wb') as f:
                            await f.write(image_data)
                        # Return None as URL to force using file path
                        
                        # Get real image size
                        real_size = "Unknown"
                        try:
                            with Image.open(BytesIO(image_data)) as img:
                                real_size = f"{img.width}x{img.height}"
                        except Exception: pass

                        # Construct detailed source info
                        source_info = f"OpenAI Compatible ({model})"
                        source_info += f" | AR: {aspect_ratio if aspect_ratio else 'Default'}"
                        source_info += f" | Res: {resolution if resolution else 'Default'} ({real_size})"
                        return None, image_path, source_info
                    except Exception as e:
                        flow_error = f"Failed to decode base64 image: {e}"
                        logger.error(f"Failed to decode base64 image: {e}")
                else:
                    flow_error = f"OpenAI API error: {result}"
            else:
                flow_error = f"OpenAI API error: Empty result"
        except Exception as e:
            flow_error = f"OpenAI API request failed: {e}"
            logger.error(f"OpenAI API failed: {e}")
            
        if provider == 'openai':
             return None, f"Error: OpenAI API failed ({flow_error})", None

    # 2. Try Flow2API (Legacy Flow)
    if use_flow and flow_api_url and not use_openai:
        # Image models use hyphen separator (e.g. gemini-2.5-flash-image-landscape)
        # ONLY apply this suffix logic if it's genuinely Flow2API (not OpenAI compatible)
        
        flow_model = model
        
        # Determine if we should apply Flow suffixes
        # Flow models usually need explicit landscape/portrait suffixes
        
        suffix = get_model_suffix(aspect_ratio, image_size, separator="-")
        
        # Special handling for Gemini models in Flow: replace "-preview" with suffix if it exists
        if "gemini" in flow_model.lower() and flow_model.endswith("-preview"):
             flow_model = flow_model[:-8] # Remove "-preview"
        
        # For all models, append suffix if not present
        if not any(s in flow_model for s in ["-landscape", "-portrait", "-square"]):
             # Note: get_model_suffix returns separator+suffix
             flow_model = f"{flow_model}{suffix}"

        messages = []
        user_content = []
        
        # Add images if any (Images first is often better for multimodal context)
        if input_images_b64:
            for b64 in input_images_b64:
                img_url = b64 if b64.startswith("data:") else f"data:image/jpeg;base64,{b64}"
                user_content.append({
                    "type": "image_url",
                    "image_url": {"url": img_url}
                })

        # Add text prompt
        user_content.append({"type": "text", "text": prompt})
        
        messages.append({"role": "user", "content": user_content})
        
        payload = {
            "model": flow_model,
            "messages": messages,
            "stream": True
        }
        
        try:
            result = await call_flow2api(flow_api_url, flow_api_token, payload)
            
            if result:
                if result.startswith("http"):
                    image_url = result
                    # Download to local path to be consistent with other return types
                    try:
                        async with aiohttp.ClientSession() as session:
                            async with session.get(image_url) as img_response:
                                if img_response.status == 200:
                                    image_path = 'downloaded_image.jpeg'
                                    image_data = await img_response.read()
                                    async with aiofiles.open(image_path, 'wb') as f:
                                        await f.write(image_data)
                                    
                                    # Get real image size
                                    real_size = "Unknown"
                                    try:
                                        with Image.open(BytesIO(image_data)) as img:
                                            real_size = f"{img.width}x{img.height}"
                                    except Exception: pass
    
                                    source_info = f"Flow2API ({flow_model})"
                                    source_info += f" | AR: {aspect_ratio if aspect_ratio else 'Default'} ({real_size})"
                                    return image_url, image_path, source_info
                                else:
                                    flow_error = f"Flow2API generated URL but download failed: {img_response.status}"
                    except Exception as e:
                        flow_error = f"Flow2API download exception: {e}"
                        logger.error(f"Failed to download Flow2API image: {e}")
                elif result.startswith("data:image"):
                    # Handle base64 data URI directly
                    try:
                        header, b64_data = result.split(',', 1)
                        image_data = base64.b64decode(b64_data)
                        image_path = 'downloaded_image.jpeg'
                        async with aiofiles.open(image_path, 'wb') as f:
                            await f.write(image_data)
                        
                        # Get real image size
                        real_size = "Unknown"
                        try:
                            with Image.open(BytesIO(image_data)) as img:
                                real_size = f"{img.width}x{img.height}"
                        except Exception: pass

                        source_info = f"Flow2API ({flow_model})"
                        source_info += f" | AR: {aspect_ratio if aspect_ratio else 'Default'} ({real_size})"
                        return None, image_path, source_info
                    except Exception as e:
                        flow_error = f"Failed to decode base64 image: {e}"
                        logger.error(f"Failed to decode base64 image: {e}")
                else:
                    flow_error = f"Flow2API error: {result}"
            else:
                flow_error = f"Flow2API error: Empty result"
        except Exception as e:
            flow_error = f"Flow2API request failed: {e}"
            logger.error(f"Flow2API failed: {e}")
        
        # If provider was explicitly 'flow', stop here
        if provider == 'flow':
            return None, f"Error: Flow2API failed ({flow_error})", None
            
        logger.warning(f"Flow2API failed ({flow_error}), falling back to Official API.")

    # 3. Official APIs
    # Only fallback if api key is present
    if not google_api_key:
         if flow_error:
             return None, f"Error: Flow2API failed ({flow_error}) and Google API Key is missing.", None
         return None, "Error: Google API Key is missing.", None

    url, path = await generate_image_gemini(prompt, google_api_key, model, image_size, input_images_b64, resolution, aspect_ratio)
    if url or (path and not path.startswith("Error:")):
        source_info = f"Google Gemini ({model})"
        source_info += f" | AR: {aspect_ratio if aspect_ratio else 'Default'}"
        source_info += f" | Res: {resolution if resolution else 'Default'}"
        return url, path, source_info
    return url, path, None

async def generate_video(prompt, model="veo_3_1_t2v_fast", input_images_b64: list = None, flow_api_url=None, flow_api_token=None, aspect_ratio=None):
    if not flow_api_url:
        return None, "Error: Flow2API URL is not configured. Video generation requires Flow2API.", None
    
    # Video models use underscore separator (e.g. veo_3_1_t2v_fast_landscape)
    # Only append suffix for t2v models, or if explicitly requested. i2v usually preserves input AR.
    # UPDATE: User confirmed i2v models DO require suffixes (e.g., veo_3_1_i2v_s_fast_fl_portrait)
    suffix = get_model_suffix(aspect_ratio, None, separator="_")
    flow_model = model
    if not any(s in model for s in ["_landscape", "_portrait"]):
        flow_model = f"{model}{suffix}"
        
    messages = []
    user_content = []
    
    # Text prompt (Send before images as per API requirement)
    user_content.append({"type": "text", "text": prompt})

    # Images (Start frame, End frame, etc.)
    if input_images_b64:
        for b64 in input_images_b64:
            img_url = b64 if b64.startswith("data:") else f"data:image/jpeg;base64,{b64}"
            user_content.append({
                "type": "image_url",
                "image_url": {"url": img_url}
            })
    
    messages.append({"role": "user", "content": user_content})
    
    payload = {
        "model": flow_model,
        "messages": messages,
        "stream": True
    }
    
    result = await call_flow2api(flow_api_url, flow_api_token, payload)
    
    if result and result.startswith("http"):
        return result, None, f"Flow2API ({flow_model})"
    
    return None, f"Error: Video generation failed via Flow2API. {result}", None

async def generate_image_gemini(prompt, api_key, model, image_size, input_images_b64: list = None, resolution: str = None, aspect_ratio: str = None):
    if input_images_b64:
        print(f"Processing {len(input_images_b64)} input images for Gemini.")

    if not api_key:
        print("Google API Key is missing.")
        return None, "Error: Google API Key is missing. Please configure it in the plugin settings."
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    
    target_ratio = "1:1"
    
    if aspect_ratio:
        target_ratio = aspect_ratio
    else:
        ar_match = re.search(r'--ar\s+(\d+:\d+)', prompt)
        if ar_match:
            user_ratio = ar_match.group(1)
            valid_ratios = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
            if user_ratio in valid_ratios:
                target_ratio = user_ratio
                prompt = prompt.replace(ar_match.group(0), "").strip()
        elif image_size:
            try:
                if "x" in image_size.lower():
                    w, h = map(int, image_size.lower().split('x'))
                    ratio = w / h
                    ratios = {
                        "1:1": 1.0,
                        "2:3": 2/3, "3:2": 3/2,
                        "3:4": 3/4, "4:3": 4/3,
                        "4:5": 4/5, "5:4": 5/4,
                        "9:16": 9/16, "16:9": 16/9,
                        "21:9": 21/9
                    }
                    target_ratio = min(ratios, key=lambda k: abs(ratios[k] - ratio))
            except Exception as e:
                print(f"Error parsing image_size '{image_size}': {e}")
            
    target_resolution = resolution
    if not target_resolution:
        res_match = re.search(r'--(1k|2k|4k)', prompt, re.IGNORECASE)
        if res_match:
            target_resolution = res_match.group(1).upper()
            prompt = prompt.replace(res_match.group(0), "").strip()
    
    prompt_with_enforcement = prompt + "\n\n(Please generate an image based on the above description. Do not describe the image, just generate it.)"
    
    parts = [{"text": prompt_with_enforcement}]
    if input_images_b64:
        for b64_data in input_images_b64:
            parts.append({
                "inline_data": {
                    "mime_type": "image/jpeg",
                    "data": b64_data
                }
            })

    generation_config = {
        "responseModalities": ["TEXT", "IMAGE"]
    }
    
    image_config = {}
    if target_ratio:
        image_config["aspectRatio"] = target_ratio
    if target_resolution and "flash" not in model.lower():
        image_config["imageSize"] = target_resolution
        
    if image_config:
        generation_config["imageConfig"] = image_config

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": generation_config
    }
    
    timeout = aiohttp.ClientTimeout(total=600)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(url, json=payload) as response:
            if response.status != 200:
                error_msg = await response.text()
                print(f"Gemini API Error: {error_msg}")
                return None, f"Error: Gemini API request failed ({response.status}). {error_msg}"
            
            data = await response.json()
            try:
                candidates = data.get('candidates', [])
                if candidates:
                    parts = candidates[0].get('content', {}).get('parts', [])
                    for part in parts:
                        inline_data = part.get('inline_data') or part.get('inlineData')
                        if inline_data:
                            b64_data = inline_data.get('data')
                            if b64_data:
                                image_data = base64.b64decode(b64_data)
                                image_path = 'downloaded_image.jpeg'
                                async with aiofiles.open(image_path, 'wb') as f:
                                    await f.write(image_data)
                                
                                # Get real image size (Though generate_image_gemini returns (url, path), not source info directly here?
                                # Wait, generate_image_gemini returns (url, path). The source info is constructed in generate_image.
                                # So we don't need to return it here, but we can't easily pass it back.
                                # Let's check generate_image logic for Official API.
                                print("Gemini image generated and saved.")
                                return None, image_path
                            
            except Exception as e:
                print(f"Error parsing Gemini response: {e}")
                return None, f"Error parsing Gemini response: {e}"
            
            text_content = ""
            try:
                if 'candidates' in data and data['candidates']:
                    parts = data['candidates'][0].get('content', {}).get('parts', [])
                    for part in parts:
                        if 'text' in part:
                            text_content += part['text']
            except:
                pass
            
            if text_content and len(text_content) > 10:
                 error_msg = f"Error: No image data found. Model Output: {text_content[:200]}"
            else:
                 debug_data = json.dumps(data, indent=2)
                 if len(debug_data) > 1000:
                     debug_data = debug_data[:1000] + "...(truncated)"
                 error_msg = f"Error: No image data found. Full Debug: {debug_data}"
            
            print(error_msg)
            return None, error_msg

if __name__ == "__main__":
    pass