import { EditAiVideoAgentClient } from "@/components/dashboard/ai-video-agent-client"

export default async function EditAiVideoAgentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return <EditAiVideoAgentClient projectId={id} />
}
