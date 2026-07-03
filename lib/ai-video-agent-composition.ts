import type {
  AiVideoAssetRecord,
  AiVideoProjectRecord,
  AiVideoSceneRecord,
  CaptionCue,
  RemotionSceneData,
} from "@/lib/ai-video-agent"
const visualAssetTypes = ["broll_image", "broll_video", "ai_video", "remotion_component", "avatar_clip"]
function assetIsSuperseded(asset: AiVideoAssetRecord) {
  return Boolean((asset.metadata as { superseded?: boolean } | null)?.superseded)
}
export function getActiveSceneVisualAsset(
  assets: AiVideoAssetRecord[],
  sceneId: string | null | undefined
) {
  const sceneAssets = [...assets].filter(
    (asset) =>
      asset.scene_id === sceneId &&
      visualAssetTypes.includes(asset.asset_type) &&
      (asset.url || asset.asset_type === "remotion_component") &&
      !assetIsSuperseded(asset)
  )
  if (sceneAssets.length === 0) return undefined
  const brollAsset = sceneAssets
    .filter((asset) => asset.asset_type !== "avatar_clip")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  if (brollAsset) return brollAsset
  return sceneAssets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
}
export function getActiveCompositionAssets(assets: AiVideoAssetRecord[]) {
  const activeByScene = new Map<string, AiVideoAssetRecord>()
  const passthrough: AiVideoAssetRecord[] = []
  for (const asset of assets) {
    if (assetIsSuperseded(asset)) continue
    if (asset.scene_id && visualAssetTypes.includes(asset.asset_type)) {
      const current = activeByScene.get(asset.scene_id)
      if (!current || new Date(asset.created_at).getTime() > new Date(current.created_at).getTime()) {
        activeByScene.set(asset.scene_id, asset)
      }
      continue
    }
    passthrough.push(asset)
  }
  return [...passthrough, ...activeByScene.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}
export function buildAiVideoAgentComposition({
  project,
  scenes,
  assets,
  captions,
}: {
  project: AiVideoProjectRecord
  scenes: AiVideoSceneRecord[]
  assets: AiVideoAssetRecord[]
  captions: CaptionCue[]
}) {
  const activeAssets = getActiveCompositionAssets(assets)
  const styledCaptions = captions.map((caption) => ({
    ...caption,
    style: project.caption_style,
  }))
  const lastCaptionEnd = Math.max(...styledCaptions.map((caption) => caption.end), 0)
  const lastSceneEnd = Math.max(...scenes.map((scene) => Number(scene.end_time)), 0)
  const durationSeconds = Math.max(1, lastCaptionEnd, lastSceneEnd, project.duration_seconds)
  return {
    id: project.id,
    title: project.title,
    requestedDurationSeconds: project.duration_seconds,
    durationSeconds,
    fps: 30,
    width: project.screen_size === "16:9" ? 1920 : 1080,
    height: project.screen_size === "16:9" ? 1080 : 1920,
    screenSize: project.screen_size,
    captionStyle: project.caption_style,
    brollStyle: project.broll_style,
    avatar: {
      id: project.avatar_id,
      name: project.avatar_name,
      imageUrl: project.avatar_image_url,
    },
    voice: {
      id: project.voice_id,
      type: project.voice_type,
      name: project.voice_name,
      voiceoverUrl: project.voiceover_url,
    },
    scenes,
    assets: activeAssets,
    captions: styledCaptions,
    timeline: {
      source: "edited_project",
      durationSeconds,
      lastCaptionEnd,
      lastSceneEnd,
    },
    transitions: scenes.map((scene) => ({
      sceneId: scene.id,
      transition: (scene.remotion_data as RemotionSceneData | null)?.transition ?? "fade",
    })),
  }
}
export type AiVideoAgentCompositionData = ReturnType<typeof buildAiVideoAgentComposition>
