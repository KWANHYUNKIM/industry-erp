import ModuleSideLayout from '../../components/ModuleSideLayout'

export default function SettingsLayout() {
  return (
    <ModuleSideLayout
      title="⚙️ 환경설정"
      tabs={[
        { to: '/settings/company', label: '회사정보관리' },
        { to: '/settings/preferences', label: '환경설정' },
        { to: '/settings/security', label: '보안관리' },
        { to: '/settings/etc', label: '기타관리시스템' },
        { to: '/settings/download', label: '다운로드' },
      ]}
    />
  )
}
