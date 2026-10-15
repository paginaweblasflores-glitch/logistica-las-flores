export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Cargando">
      <div className="h-8 w-72 rounded-lg bg-line" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 rounded-[14px] bg-white" />)}
      </div>
      <div className="h-80 rounded-[14px] bg-white" />
    </div>
  )
}
