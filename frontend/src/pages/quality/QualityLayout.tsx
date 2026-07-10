import ModuleSideLayout from '../../components/ModuleSideLayout'

export default function QualityLayout() {
  return (
    <ModuleSideLayout
      title="🔧 품질/로트"
      tabs={[
        { to: '/quality/inspection', label: '품질관리' },
        { to: '/quality/serial-lot', label: '시리얼/로트No.' },
        { to: '/quality/as', label: 'A/S관리' },
      ]}
    />
  )
}
