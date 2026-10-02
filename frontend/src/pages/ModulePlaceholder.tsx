interface Props {
  icon: string
  title: string
  description: string
}

export default function ModulePlaceholder({ icon, title, description }: Props) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ec-text">
        {icon} {title}
      </h1>
      <p className="mt-1 text-ec-hint">{description}</p>

      <div className="mt-8 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-ec-line bg-white py-20 text-center">
        <div className="text-5xl">🚧</div>
        <p className="mt-4 font-medium text-ec-label">이 모듈은 아직 구축 전입니다.</p>
        <p className="mt-1 text-sm text-ec-off">
          다음 단계에서 화면과 기능을 추가할 예정입니다.
        </p>
      </div>
    </div>
  )
}
