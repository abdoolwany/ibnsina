import ChildEditPage from '@/components/ChildEditPage'

export default async function EditEntryChildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ChildEditPage id={id} allowedRole="hospital_entry" backPath="/hospital-entry" />
}
