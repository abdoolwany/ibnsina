import ChildEditPage from '@/components/ChildEditPage'

export default async function EditVerifierChildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ChildEditPage id={id} allowedRole="hospital_verifier" backPath="/hospital-verifier" />
}
