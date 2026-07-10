import ModuleSideLayout from '../../components/ModuleSideLayout'

export default function DatacenterLayout() {
  return (
    <ModuleSideLayout
      title="🗄 데이터센터"
      tabs={[
        { to: '/datacenter/collect', label: '데이터수집' },
        { to: '/datacenter/export', label: '데이터내보내기' },
      ]}
    />
  )
}
