import re
import random
from astrbot.api.all import *
from astrbot.api import logger
from astrbot.api.event import filter, AstrMessageEvent
from .ttp import generate_image, generate_video
from astrbot.api.message_components import *

@register("pic-gen", "喵喵", "使用硅基流动api 让llm帮你画图", "0.0.2")
class MyPlugin(Star):
    def __init__(self, context: Context,config: dict):
        super().__init__(context)
        self.config = config # Save full config for dynamic access
        self.google_api_key = config.get("google_api_key")
        
        self.group_white_list = config.get("group_white_list", [])
        self.user_white_list = config.get("user_white_list", [])
        self.ignore_at_qq_list = config.get("ignore_at_qq_list", [])
        
        # API Configs
        self.openai_api_url = config.get("openai_api_url", "http://localhost:8317/v1/chat/completions")
        self.openai_api_tokens = config.get("openai_api_tokens", [])
        
        self.flow_api_url = config.get("flow_api_url", "http://localhost:8317/v1/chat/completions")
        self.flow_api_tokens = config.get("flow_api_tokens", [])
        
        # Model Names
        self.openai_model = config.get("openai_model", "gemini-2.5-flash-image-preview")
        self.openai_pro_model = config.get("openai_pro_model", "gemini-3-pro-image-preview")
        self.nano_model = config.get("nano_model", "gemini-2.5-flash-image-preview")
        self.nanopro_model = config.get("nanopro_model", "gemini-3.0-pro-image")
        self.flow_model = config.get("flow_model", "gemini-2.5-flash-image")
        self.flowpro_model = config.get("flowpro_model", "gemini-3.0-pro-image")
        
        # Round-Robin Counters
        self.openai_idx = 0
        self.flow_idx = 0

    def _check_permission(self, event: AstrMessageEvent) -> bool:
        if not self.group_white_list and not self.user_white_list:
            return True
        
        user_id = event.message_obj.sender.user_id
        if self.user_white_list and str(user_id) in [str(uid) for uid in self.user_white_list]:
            return True
            
        group_id = None
        if hasattr(event, 'message_obj') and event.message_obj:
            group_id = getattr(event.message_obj, 'group_id', None)
            
        if group_id and self.group_white_list:
            if str(group_id) in [str(gid) for gid in self.group_white_list]:
                return True

        return False
        
    def _get_next_api(self, api_type="openai"):
        """Get next API config (URL, Token) using Round-Robin for Tokens"""
        if api_type == "openai":
            if not self.openai_api_tokens: return self.openai_api_url, None
            token = self.openai_api_tokens[self.openai_idx % len(self.openai_api_tokens)]
            self.openai_idx += 1
            return self.openai_api_url, token
        elif api_type == "flow":
            if not self.flow_api_tokens: return self.flow_api_url, None
            token = self.flow_api_tokens[self.flow_idx % len(self.flow_api_tokens)]
            self.flow_idx += 1
            return self.flow_api_url, token
        return None, None
    async def _get_event_images(self, event: AstrMessageEvent, include_sender_avatar: bool = False) -> list[str]:
        """Extract images from event (message, quoted message, @mention avatar, and optional sender avatar)."""
        input_images_b64 = []
        
        # Helper to process a list of components
        async def process_chain(chain):
            for comp in chain:
                if isinstance(comp, Image):
                    try:
                        base64_data = await comp.convert_to_base64()
                        input_images_b64.append(base64_data)
                    except Exception as e:
                        logger.warning(f"Failed to convert image to base64: {e}")

        # 1. Current message images
        if hasattr(event, 'message_obj') and event.message_obj and hasattr(event.message_obj, 'message'):
            await process_chain(event.message_obj.message)
            
            # 2. Quoted message (Reply) images
            for comp in event.message_obj.message:
                if isinstance(comp, Reply) and comp.chain:
                    await process_chain(comp.chain)

        # 3. @Mention Avatars (Appended last)
        if hasattr(event, 'message_obj') and event.message_obj and hasattr(event.message_obj, 'message'):
            for comp in event.message_obj.message:
                if isinstance(comp, At):
                    try:
                        qq_id = str(comp.qq)
                        # Check ignore list (convert all to strings for comparison)
                        ignore_list = [str(x) for x in self.ignore_at_qq_list]
                        
                        if qq_id and qq_id not in ignore_list:
                            avatar_url = f"https://q1.qlogo.cn/g?b=qq&nk={qq_id}&s=640"
                            # Use Image.fromURL to download and convert
                            img_obj = Image.fromURL(avatar_url)
                            base64_data = await img_obj.convert_to_base64()
                            if base64_data:
                                input_images_b64.append(base64_data)
                    except Exception as e:
                        logger.warning(f"Failed to fetch avatar for {comp.qq}: {e}")
        
        # 4. Sender Avatar (if requested)
        if include_sender_avatar:
            try:
                sender_id = event.message_obj.sender.user_id
                if sender_id:
                     avatar_url = f"https://q1.qlogo.cn/g?b=qq&nk={sender_id}&s=640"
                     img_obj = Image.fromURL(avatar_url)
                     base64_data = await img_obj.convert_to_base64()
                     if base64_data:
                         input_images_b64.append(base64_data)
            except Exception as e:
                logger.warning(f"Failed to fetch sender avatar: {e}")

        return input_images_b64

    async def _generate_core(self, event, prompt, model_name, provider="flow", config_group=None, aspect_ratio=None, resolution=None, input_images_b64=None):
        """Core logic for image generation."""
        action = "改图" if input_images_b64 else "生图"
        
        # 参数解析 logic moved from _handle_gen_image
        if provider == "flow":
            # Flow2API: Only l/p
            if "--ar l" in prompt.lower():
                aspect_ratio = "landscape"
                prompt = re.sub(r'--ar\s+l', '', prompt, flags=re.IGNORECASE).strip()
            elif "--ar p" in prompt.lower():
                aspect_ratio = "portrait"
                prompt = re.sub(r'--ar\s+p', '', prompt, flags=re.IGNORECASE).strip()
            
        elif (provider == "openai" or provider == "official") and config_group:
            # Load specific config for this command group
            enable_ar = self.config.get(f"{config_group}_enable_ar", True)
            allowed_ars = self.config.get(f"{config_group}_allowed_ars", ["1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","21:9"])
            enable_res = self.config.get(f"{config_group}_enable_res", False)
            allowed_res = self.config.get(f"{config_group}_allowed_res", ["1k", "2k", "4k"])

            # 只在 aspect_ratio 未传入时才从 prompt 解析
            if enable_ar and not aspect_ratio:
                # Build regex from allowed_ars
                ar_pattern = "|".join([re.escape(ar) for ar in allowed_ars] + ["square", "landscape", "portrait"])
                ar_match = re.search(r'--ar\s+(' + ar_pattern + r')', prompt, re.IGNORECASE)
                
                if ar_match:
                    aspect_ratio = ar_match.group(1)
                    prompt = prompt.replace(ar_match.group(0), "").strip()
                
                # Support --ar l/p mapping for convenience if enabled
                if not aspect_ratio:
                    if "--ar l" in prompt.lower():
                        aspect_ratio = "16:9" # Default landscape
                        prompt = re.sub(r'--ar\s+l', '', prompt, flags=re.IGNORECASE).strip()
                    elif "--ar p" in prompt.lower():
                        aspect_ratio = "9:16" # Default portrait
                        prompt = re.sub(r'--ar\s+p', '', prompt, flags=re.IGNORECASE).strip()

            # 只在 resolution 未传入时才从 prompt 解析
            if enable_res and not resolution:
                # Build regex from allowed_resolutions
                res_pattern = "|".join([re.escape(res) for res in allowed_res])
                res_match = re.search(r'--(' + res_pattern + r')', prompt, re.IGNORECASE)
                if res_match:
                    resolution = res_match.group(1).upper()
                    prompt = prompt.replace(res_match.group(0), "").strip()
        
        google_api_key = self.google_api_key

        # Get API URL/Token based on provider
        current_api_url = None
        current_api_token = None
        
        if provider == "openai":
            current_api_url, current_api_token = self._get_next_api("openai")
            if not current_api_url:
                return False, f"❌ 未配置 OpenAI 兼容 API URL (openai_api_url)。", None, None
        elif provider == "flow":
            current_api_url, current_api_token = self._get_next_api("flow")
            if not current_api_url:
                return False, f"❌ 未配置 Flow API URL (flow_api_url)。", None, None

        image_url, image_path, source = await generate_image(
            prompt,
            google_api_key=google_api_key,
            model=model_name,
            input_images_b64=input_images_b64 or [],
            flow_api_url=current_api_url,
            flow_api_token=current_api_token,
            provider=provider,
            aspect_ratio=aspect_ratio,
            resolution=resolution
        )
        
        if not image_url and not image_path:
            return False, f"{action}失败，未知错误。", None, None
        if image_path and image_path.startswith("Error:"):
            return False, f"{action}失败: {image_path}", None, None

        chain = []
        if image_url:
            chain = [Image.fromURL(image_url)]
        elif image_path:
            chain = [Image.fromFileSystem(image_path)]
        else:
            return False, f"{action}失败。", None, None
            
        return True, "Success", chain, source

    async def _handle_gen_image(self, event, prompt, model_name, provider="flow", config_group=None):
        """Helper for image generation handling (Generator for Commands)"""
        if not self._check_permission(event):
            yield event.plain_result("❌ 未授权使用生图功能。")
            return

        # 提取图片 (Current + Quote)
        input_images_b64 = await self._get_event_images(event)
        
        action = "改图" if input_images_b64 else "生图"
        yield event.plain_result(f"正在{action} ({provider} - {config_group if config_group else 'Flow'})... Prompt: {prompt}")

        success, msg, chain, source = await self._generate_core(event, prompt, model_name, provider, config_group, input_images_b64=input_images_b64)

        if not success:
            yield event.plain_result(msg)
            return
        
        if source:
            yield event.plain_result(f"✅ 使用模型: {source}")
        yield event.chain_result(chain)

    @llm_tool(name="pic-gen")
    async def pic_gen(self, event: AstrMessageEvent, prompt: str = "", aspect_ratio: str = None, resolution: str = None, is_pro: bool = False, use_sender_avatar: bool = False) -> str:
        """
        高质量绘图**首选**。使用OpenAI兼容免费渠道，支持Pro模型、多尺寸及1k/2k/4k分辨率。当用户需要高质量图片或指定分辨率时，因其免费特性，优先使用此工具。
        
        Args:
            prompt (string): Image description.
            aspect_ratio (string): Optional aspect ratio (e.g. "16:9", "4:3", "1:1").
            resolution (string): Optional resolution (e.g. "1K", "2K", "4K").
            is_pro (bool): Set to True if user requests "high quality", "4k", "pro" model. Default True.
            use_sender_avatar (bool): Set to True if user refers to "me", "my avatar", "self", or "I" as the reference image.
        """
        model = self.openai_pro_model
        config_group = "openai_pro"

        # 自动提取图片 (Current + Quote + Mention + Sender)
        input_images_b64 = await self._get_event_images(event, include_sender_avatar=use_sender_avatar)

        # 直接传递 aspect_ratio 和 resolution 参数，而不是追加到 prompt
        success, msg, chain, source = await self._generate_core(
            event, prompt, model, provider="openai", config_group=config_group,
            aspect_ratio=aspect_ratio, resolution=resolution,
            input_images_b64=input_images_b64
        )
        if success:
            await event.send(event.chain_result(chain))
            ref_msg = f" using {len(input_images_b64)} reference image(s)" if input_images_b64 else ""
            return f"Image generated successfully{ref_msg}. Model: {source}. AR: {aspect_ratio}, Res: {resolution}. Prompt: {prompt}"
        else:
            return f"Image generation failed: {msg}"

    @llm_tool(name="nano-gen")
    async def nano_gen(self, event: AstrMessageEvent, prompt: str = "", aspect_ratio: str = None, resolution: str = None, is_pro: bool = False, use_sender_avatar: bool = False) -> str:
        """
        高质量绘图**备选**（付费）。使用官方API，支持Pro模型、多尺寸及1k/2k/4k分辨率。仅当pic-gen失败或用户明确要求使用官方渠道/nano时使用。
        
        Args:
            prompt (string): Image description.
            aspect_ratio (string): Optional aspect ratio (e.g. "16:9", "4:3", "1:1").
            resolution (string): Optional resolution (e.g. "1K", "2K", "4K"). Only effective if is_pro=True.
            is_pro (bool): Set to True if user requests "high quality", "4k", "pro" model. Default False.
            use_sender_avatar (bool): Set to True if user refers to "me", "my avatar", "self", or "I" as the reference image.
        """
        model = self.nanopro_model if is_pro else self.nano_model
        config_group = "nano_pro" if is_pro else "nano_normal"
        
        # 自动提取图片
        input_images_b64 = await self._get_event_images(event, include_sender_avatar=use_sender_avatar)

        # 直接传递 aspect_ratio 和 resolution 参数
        success, msg, chain, source = await self._generate_core(
            event, prompt, model, provider="official", config_group=config_group,
            aspect_ratio=aspect_ratio, resolution=resolution,
            input_images_b64=input_images_b64
        )
        if success:
            await event.send(event.chain_result(chain))
            ref_msg = f" using {len(input_images_b64)} reference image(s)" if input_images_b64 else ""
            return f"Image generated successfully{ref_msg}. Model: {source}. AR: {aspect_ratio}, Res: {resolution}. Prompt: {prompt}"
        else:
            return f"Image generation failed: {msg}"

    @llm_tool(name="flow-gen")
    async def flow_gen(self, event: AstrMessageEvent, prompt: str = "", aspect_ratio: str = "landscape", is_pro: bool = False, use_sender_avatar: bool = False) -> str:
        """
        快速/简单绘图首选。虽然支持Pro模型（高质量），但仅支持1k分辨率及横屏(16:9)/竖屏(9:16)，无法精细调节。速度快且免费。当用户需要快速生成高质量图片但对分辨率/细节控制无严格要求时，优先使用此工具。
        
        Args:
            prompt (string): Description of the image.
            aspect_ratio (string): "landscape" (or "l") for horizontal, "portrait" (or "p") for vertical. Default is "landscape".
            is_pro (bool): Set to True if user requests "pro" model. Default False.
            use_sender_avatar (bool): Set to True if user refers to "me", "my avatar", "self", or "I" as the reference image.
        """
        full_prompt = prompt
        if aspect_ratio: full_prompt += f" --ar {aspect_ratio}"
        
        model = self.flowpro_model if is_pro else self.flow_model
        
        # 自动提取图片
        input_images_b64 = await self._get_event_images(event, include_sender_avatar=use_sender_avatar)

        success, msg, chain, source = await self._generate_core(event, full_prompt, model, provider="flow", input_images_b64=input_images_b64)
        if success:
            await event.send(event.chain_result(chain))
            ref_msg = f" using {len(input_images_b64)} reference image(s)" if input_images_b64 else ""
            return f"Image generated successfully{ref_msg}. Model: {source}. Prompt: {full_prompt}"
        else:
            return f"Image generation failed: {msg}"

    @llm_tool(name="veo-gen")
    async def veo_gen(self, event: AstrMessageEvent, prompt: str = "", aspect_ratio: str = "landscape", use_sender_avatar: bool = False) -> str:
        """
        flow平台免费生成视频，支持横竖屏。
        
        Args:
            prompt (string): Description of the video.
            aspect_ratio (string): "landscape" (or "l") for horizontal, "portrait" (or "p") for vertical. Default is "landscape".
            use_sender_avatar (bool): Set to True if user refers to "me", "my avatar", "self", or "I" as the reference image.
        """
        if not self._check_permission(event):
            await event.send(event.plain_result("❌ 未授权使用生视频功能。"))
            return "Video generation failed: Unauthorized."
            
        flow_url, flow_token = self._get_next_api("flow")
        if not flow_url:
             await event.send(event.plain_result("❌ 未配置 Flow API URL (flow_api_url)。"))
             return "Video generation failed: Missing API URL."

        # Normalize AR
        ar_param = "landscape"
        if aspect_ratio.lower() in ["p", "portrait"]: ar_param = "portrait"
        
        # Determine model (default to t2v)
        model = "veo_3_1_t2v_fast"
        
        # Check for input images (i2v) - Current + Quote + Mention + Sender
        input_images_b64 = await self._get_event_images(event, include_sender_avatar=use_sender_avatar)
        
        if len(input_images_b64) >= 1:
            model = "veo_3_1_i2v_s_fast_fl"

        await event.send(event.plain_result(f"正在生成视频 (Veo - {ar_param})... Prompt: {prompt}"))

        try:
            video_url, error_msg, source = await generate_video(
                prompt,
                model=model,
                input_images_b64=input_images_b64,
                flow_api_url=flow_url,
                flow_api_token=flow_token,
                aspect_ratio=ar_param
            )
            
            if not video_url:
                err = error_msg if error_msg else "未知错误"
                await event.send(event.plain_result(f"视频生成失败: {err}"))
                return f"Video generation failed: {err}"
        except Exception as e:
            logger.error(f"Video generation exception: {e}")
            await event.send(event.plain_result(f"视频生成发生异常: {e}"))
            return f"Video generation failed: {e}"
            
        await event.send(event.chain_result([Video.fromURL(video_url)]))
        if source:
            await event.send(event.plain_result(f"✅ 使用模型: {source}"))
            
        ref_msg = f" using {len(input_images_b64)} reference image(s)" if input_images_b64 else ""
        return f"Video generated successfully{ref_msg}. Model: {model}. Prompt: {prompt}"

    # @filter.command("生图")
    # async def cmd_gen_image_openai(self, event: AstrMessageEvent, prompt: str = ""):
    #     """(OpenAI Compatible) 使用配置的 openai_model 生图。"""
    #     texts = [comp.text for comp in event.message_obj.message if isinstance(comp, Plain)]
    #     full_text = "".join(texts).strip()
    #     if "/生图" in full_text: prompt = full_text.split("/生图", 1)[1].strip()
    #     elif "生图" in full_text: prompt = full_text.split("生图", 1)[1].strip()
    #     
    #     async for result in self._handle_gen_image(event, prompt, self.openai_model, provider="openai", config_group="openai_normal"):
    #         yield result

    @filter.command("生图pro")
    async def cmd_gen_image_openai_pro(self, event: AstrMessageEvent, prompt: str = ""):
        """(OpenAI Compatible) 使用配置的 openai_pro_model 生图。"""
        texts = [comp.text for comp in event.message_obj.message if isinstance(comp, Plain)]
        full_text = "".join(texts).strip()
        if "/生图pro" in full_text: prompt = full_text.split("/生图pro", 1)[1].strip()
        elif "生图pro" in full_text: prompt = full_text.split("生图pro", 1)[1].strip()

        async for result in self._handle_gen_image(event, prompt, self.openai_pro_model, provider="openai", config_group="openai_pro"):
            yield result

    @filter.command("nano")
    async def cmd_gen_image_nano(self, event: AstrMessageEvent, prompt: str = ""):
        """(官方API) 使用配置的 nano_model 生图。"""
        texts = [comp.text for comp in event.message_obj.message if isinstance(comp, Plain)]
        full_text = "".join(texts).strip()
        if "/nano" in full_text: prompt = full_text.split("/nano", 1)[1].strip()
        elif "nano" in full_text: prompt = full_text.split("nano", 1)[1].strip()

        async for result in self._handle_gen_image(event, prompt, self.nano_model, provider="official", config_group="nano_normal"):
            yield result

    @filter.command("nanopro")
    async def cmd_gen_image_nanopro(self, event: AstrMessageEvent, prompt: str = ""):
        """(官方API) 使用配置的 nanopro_model 生图。"""
        texts = [comp.text for comp in event.message_obj.message if isinstance(comp, Plain)]
        full_text = "".join(texts).strip()
        if "/nanopro" in full_text: prompt = full_text.split("/nanopro", 1)[1].strip()
        elif "nanopro" in full_text: prompt = full_text.split("nanopro", 1)[1].strip()

        async for result in self._handle_gen_image(event, prompt, self.nanopro_model, provider="official", config_group="nano_pro"):
            yield result

    @filter.command("flow")
    async def cmd_gen_image_flow(self, event: AstrMessageEvent, prompt: str = ""):
        """(Flow2API) 使用配置的 flow_model 生图。参数: --ar l (横屏) / --ar p (竖屏)。"""
        texts = [comp.text for comp in event.message_obj.message if isinstance(comp, Plain)]
        full_text = "".join(texts).strip()
        if "/flow" in full_text: prompt = full_text.split("/flow", 1)[1].strip()
        elif "flow" in full_text: prompt = full_text.split("flow", 1)[1].strip()
        
        async for result in self._handle_gen_image(event, prompt, self.flow_model, provider="flow"):
            yield result

    @filter.command("flowpro")
    async def cmd_gen_image_flow_pro(self, event: AstrMessageEvent, prompt: str = ""):
        """(Flow2API) 使用配置的 flowpro_model 生图。参数: --ar l (横屏) / --ar p (竖屏)。"""
        texts = [comp.text for comp in event.message_obj.message if isinstance(comp, Plain)]
        full_text = "".join(texts).strip()
        if "/flowpro" in full_text: prompt = full_text.split("/flowpro", 1)[1].strip()
        elif "flowpro" in full_text: prompt = full_text.split("flowpro", 1)[1].strip()
        
        async for result in self._handle_gen_image(event, prompt, self.flowpro_model, provider="flow"):
            yield result

    @filter.command("生视频")
    async def cmd_gen_video(self, event: AstrMessageEvent, prompt: str = ""):
        """使用 Flow2API 生成视频。用法：/生视频 <提示词>。支持附带图片作为首尾帧。"""
        if not self._check_permission(event):
            yield event.plain_result("❌ 未授权使用生视频功能。")
            return
            
        # Use Flow APIs for video
        flow_url, flow_token = self._get_next_api("flow")
        if not flow_url:
             yield event.plain_result("❌ 未配置 Flow API URL (flow_api_url)，无法使用生视频功能。")
             return

        # 手动提取完整 prompt
        texts = []
        for comp in event.message_obj.message:
            if isinstance(comp, Plain):
                texts.append(comp.text)
        
        full_text = "".join(texts).strip()
        
        if "/生视频" in full_text:
            prompt = full_text.split("/生视频", 1)[1].strip()
        elif "生视频" in full_text:
            prompt = full_text.split("生视频", 1)[1].strip()
            
            prompt = full_text.split("生视频", 1)[1].strip()
            
        # 提取图片 - Current + Quote
        input_images_b64 = await self._get_event_images(event)

        # Flow2API Video AR: --ar l / p
        aspect_ratio = "landscape" # Default
        
        # Enhanced AR parsing
        ar_match_l = re.search(r'--ar\s+(l|landscape)', prompt, re.IGNORECASE)
        ar_match_p = re.search(r'--ar\s+(p|portrait)', prompt, re.IGNORECASE)
        
        if ar_match_p:
            aspect_ratio = "portrait"
            prompt = prompt.replace(ar_match_p.group(0), "").strip()
        elif ar_match_l:
            aspect_ratio = "landscape"
            prompt = prompt.replace(ar_match_l.group(0), "").strip()

        # 确定模型
        model = "veo_3_1_t2v_fast" # 默认文生视频
        if len(input_images_b64) == 2:
            model = "veo_3_1_i2v_s_fast_fl" # 首尾帧
            yield event.plain_result(f"正在生成视频 (首尾帧模式 - {aspect_ratio})... Prompt: {prompt}")
        elif len(input_images_b64) == 1:
            model = "veo_3_1_i2v_s_fast_fl" # 图生视频 (i2v)
            yield event.plain_result(f"正在生成视频 (图生视频模式 - {aspect_ratio})... Prompt: {prompt}")
        else:
            yield event.plain_result(f"正在生成视频 (文生视频模式 - {aspect_ratio})... Prompt: {prompt}")

        try:
            video_url, error_msg, source = await generate_video(
                prompt,
                model=model,
                input_images_b64=input_images_b64,
                flow_api_url=flow_url,
                flow_api_token=flow_token,
                aspect_ratio=aspect_ratio
            )
            
            if not video_url:
                err = error_msg if error_msg else "未知错误"
                yield event.plain_result(f"视频生成失败: {err}")
                return
        except Exception as e:
            logger.error(f"Video generation exception: {e}")
            yield event.plain_result(f"视频生成发生异常: {e}")
            return
            
        yield event.chain_result([Video.fromURL(video_url)])
        if source:
            yield event.plain_result(f"✅ 使用模型: {source}")

    @filter.command("生图help")
    async def cmd_image_help(self, event: AstrMessageEvent):
        """显示生图插件的帮助信息"""
        # Helper to format list or show "不支持"
        def fmt(enabled, items):
            return ', '.join(items) if enabled else '不支持'

        help_msg = (
            "🎨 **生图插件帮助** 🎨\n\n"
            "**自然语言生图 (推荐):**\n"
            "直接发送 \"帮我画一张...\" 或 \"画个...\" 即可，会自动调用画图工具。\n"
            "当前可用工具:\n"
            "- **pic-gen**: 通过反重力调用大香蕉，支持比例和分辨率\n"
            "- **nano-gen**: 通过谷歌付费API调用大小香蕉，支持比例和分辨率\n"
            "- **flow-gen**: 通过谷歌Flow平台免费调用大小香蕉，即支持1k横竖屏\n"
            "- **veo-gen**: 通过谷歌Flow平台免费生成视频，支持横竖屏\n"
            "示例: \"帮我画一张赛博朋克风格的猫\"\n\n"
            "**OpenAI 兼容模式:**\n"
            f"- `/生图 <提示词>`: (暂停使用) 因 Flash 模型失效暂时停用，暂时只能使用 /生图pro\n"
            f"- `/生图pro <提示词>`: {self.openai_pro_model}\n"
            f"  支持比例: {fmt(self.config.get('openai_pro_enable_ar'), self.config.get('openai_pro_allowed_ars'))}\n"
            f"  支持分辨率: {fmt(self.config.get('openai_pro_enable_res'), self.config.get('openai_pro_allowed_res'))}\n"
            f"  参数示例: --ar 16:9 --4k\n\n"
            "**官方 API 模式:**\n"
            f"- `/nano <提示词>`: {self.nano_model}\n"
            f"  支持比例: {fmt(self.config.get('nano_normal_enable_ar'), self.config.get('nano_normal_allowed_ars'))}\n"
            f"  支持分辨率: {fmt(self.config.get('nano_normal_enable_res'), self.config.get('nano_normal_allowed_res'))}\n"
            f"- `/nanopro <提示词>`: {self.nanopro_model}\n"
            f"  支持比例: {fmt(self.config.get('nano_pro_enable_ar'), self.config.get('nano_pro_allowed_ars'))}\n"
            f"  支持分辨率: {fmt(self.config.get('nano_pro_enable_res'), self.config.get('nano_pro_allowed_res'))}\n\n"
            "**Flow 模式:**\n"
            f"- `/flow <提示词>`: {self.flow_model}\n"
            f"- `/flowpro <提示词>`: {self.flowpro_model}\n"
            "  参数: `--ar l` (横屏), `--ar p` (竖屏)\n\n"
            "**视频生成:**\n"
            "- `/生视频 <提示词>`: Flow2API 视频生成\n"
            "  参数: `--ar l` (横屏), `--ar p` (竖屏)\n"
            "  支持附带图片进行图生视频或首尾帧生成。"
        )
        yield event.plain_result(help_msg)