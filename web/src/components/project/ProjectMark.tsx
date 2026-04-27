import clsx from 'clsx'

export function ProjectMark({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={clsx('relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-none bg-[#1c1917] shadow-[0_0_0_1px_rgba(245,200,66,0.3)]', className)}
    >
      <div className="absolute inset-[1px] rounded-none border border-[#f59e0b]/35" />
      <div className="absolute inset-0 opacity-85 blur-[1px]">
        <div className="absolute left-[6px] top-[4px] h-1 w-1 bg-[#f5c842] shadow-[4px_0_0_0_#f5c842,8px_0_0_0_#f5c842,12px_0_0_0_#f5c842,0_4px_0_0_#f5c842,16px_4px_0_0_#f5c842,0_8px_0_0_#f5c842,4px_8px_0_0_#f5c842,8px_8px_0_0_#f5c842,12px_8px_0_0_#f5c842,0_12px_0_0_#f5c842,8px_12px_0_0_#f5c842,0_16px_0_0_#f5c842,12px_16px_0_0_#f5c842,0_20px_0_0_#f5c842,16px_20px_0_0_#f5c842,0_24px_0_0_#f5c842,16px_24px_0_0_#f5c842]" />
      </div>
      <div className="relative grid grid-cols-5 grid-rows-6 gap-0.5">
        <span className="col-span-4 row-start-1 row-end-2 block h-1 w-full bg-[#f5c842]" />
        <span className="col-start-1 col-end-2 row-start-2 row-end-3 block h-1 w-full bg-[#f5c842]" />
        <span className="col-start-5 col-end-6 row-start-2 row-end-3 block h-1 w-full bg-[#f5c842]" />
        <span className="col-span-4 row-start-3 row-end-4 block h-1 w-full bg-[#f5c842]" />
        <span className="col-start-1 col-end-2 row-start-4 row-end-5 block h-1 w-full bg-[#f5c842]" />
        <span className="col-start-3 col-end-4 row-start-4 row-end-5 block h-1 w-full bg-[#f5c842]" />
        <span className="col-start-1 col-end-2 row-start-5 row-end-6 block h-1 w-full bg-[#f5c842]" />
        <span className="col-start-4 col-end-5 row-start-5 row-end-6 block h-1 w-full bg-[#f5c842]" />
        <span className="col-start-1 col-end-2 row-start-6 row-end-7 block h-1 w-full bg-[#f5c842]" />
        <span className="col-start-5 col-end-6 row-start-6 row-end-7 block h-1 w-full bg-[#f5c842]" />
      </div>
    </div>
  )
}
