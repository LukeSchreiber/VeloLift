import { X, TrendingDown, Zap, Target } from 'lucide-react';

export default function SetDetailView({ set, exerciseName, onClose }) {
  if (!set) return null;

  const repDetails = set.repDetails || [];
  const hasRepData = repDetails.length > 0;

  const avgVelocity = set.avgVelocity || 0;
  const peakVelocity = hasRepData
    ? Math.max(...repDetails.map(r => r.peakVelocity || r.avgVelocity))
    : avgVelocity;

  // Use the best rep's avg velocity as baseline (not rep 1, which may be noisy)
  const bestRepAvg = hasRepData
    ? Math.max(...repDetails.map(r => r.avgVelocity))
    : avgVelocity;
  const lastRepAvg = hasRepData ? repDetails[repDetails.length - 1].avgVelocity : 0;
  const velocityDrop = hasRepData && repDetails.length > 1 && bestRepAvg > 0
    ? ((bestRepAvg - lastRepAvg) / bestRepAvg * 100)
    : 0;

  const maxChartValue = hasRepData
    ? Math.max(...repDetails.map(r => r.peakVelocity || r.avgVelocity)) * 1.1
    : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md">
      <div className="relative w-full max-w-2xl mx-4 glass-panel rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/5">
          <div>
            <h2 className="text-white font-medium uppercase tracking-widest text-sm">{exerciseName}</h2>
            <div className="flex items-center gap-4 mt-2 text-sm text-[#a1a1aa]">
              <span className="font-mono-nums">{set.weight} lbs</span>
              <span className="text-[#2a2a2a]">·</span>
              <span className="font-mono-nums">{set.reps} reps</span>
              {avgVelocity > 0 && (
                <>
                  <span className="text-[#2a2a2a]">·</span>
                  <span className="font-mono-nums">{avgVelocity.toFixed(2)} m/s avg</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#52525b] hover:text-white hover:bg-white/5 rounded-full transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={1.25} />
          </button>
        </div>

        {/* Content */}
        <div className="p-8">
          {hasRepData ? (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-4 mb-10">
                <div className="text-center py-6">
                  <Zap className="w-4 h-4 text-[#a1a1aa] mx-auto mb-3" strokeWidth={1.25} />
                  <div className="text-2xl font-extralight font-mono-nums text-white">{peakVelocity.toFixed(2)}</div>
                  <div className="text-[9px] text-[#52525b] tracking-widest uppercase mt-2">Peak m/s</div>
                </div>
                <div className="text-center py-6">
                  <Target className="w-4 h-4 text-[#a1a1aa] mx-auto mb-3" strokeWidth={1.25} />
                  <div className="text-2xl font-extralight font-mono-nums text-white">{avgVelocity.toFixed(2)}</div>
                  <div className="text-[9px] text-[#52525b] tracking-widest uppercase mt-2">Avg m/s</div>
                </div>
                <div className="text-center py-6">
                  <TrendingDown className="w-4 h-4 text-[#a1a1aa] mx-auto mb-3" strokeWidth={1.25} />
                  <div className={`text-2xl font-extralight font-mono-nums ${velocityDrop > 10 ? 'text-[#a1a1aa]' : 'text-white'}`}>
                    {velocityDrop.toFixed(0)}%
                  </div>
                  <div className="text-[9px] text-[#52525b] tracking-widest uppercase mt-2">Vel Drop</div>
                </div>
              </div>

              {/* Velocity Bar Chart */}
              <div className="mb-10">
                <h3 className="text-[10px] text-[#52525b] tracking-widest uppercase mb-5">Rep-by-Rep Velocity</h3>
                <div className="border border-white/5 rounded-xl p-6">
                  <div className="flex items-end justify-center gap-4" style={{ height: '140px' }}>
                    {repDetails.map((rep, idx) => {
                      const avgHeight = (rep.avgVelocity / maxChartValue) * 140;
                      const peakHeight = ((rep.peakVelocity || rep.avgVelocity) / maxChartValue) * 140;

                      return (
                        <div key={idx} className="flex flex-col items-center" style={{ width: `${Math.max(100 / repDetails.length - 2, 8)}%` }}>
                          <div className="relative w-full flex justify-center" style={{ height: '120px' }}>
                            {/* Peak velocity bar (lighter, behind) */}
                            <div
                              className="absolute bottom-0 w-full bg-white/5 rounded-t"
                              style={{ height: `${peakHeight}px` }}
                            />
                            {/* Avg velocity bar (solid, in front) */}
                            <div
                              className="absolute bottom-0 w-3/4 rounded-t transition-all bg-white"
                              style={{ height: `${avgHeight}px` }}
                            />
                          </div>
                          <span className="text-[10px] text-[#52525b] font-mono-nums mt-2">{idx + 1}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-center gap-8 mt-4 text-[9px] text-[#52525b]">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-white rounded-sm" /> Avg
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-white/10 rounded-sm" /> Peak
                  </span>
                </div>
              </div>

              {/* Rep Details Table */}
              <div>
                <h3 className="text-[10px] text-[#52525b] tracking-widest uppercase mb-4">Detailed Breakdown</h3>
                <div className="border border-white/5 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="text-[#52525b] text-[10px] uppercase tracking-wider border-b border-white/5">
                      <tr>
                        <th className="px-5 py-3 text-left font-normal">Rep</th>
                        <th className="px-5 py-3 text-right font-normal">Avg Vel</th>
                        <th className="px-5 py-3 text-right font-normal">Peak Vel</th>
                        <th className="px-5 py-3 text-right font-normal">Duration</th>
                        <th className="px-5 py-3 text-right font-normal">% of Best</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {repDetails.map((rep, idx) => {
                        const percentOfBest = bestRepAvg > 0
                          ? (rep.avgVelocity / bestRepAvg * 100)
                          : 100;
                        const isFatigued = percentOfBest < 89;

                        return (
                          <tr key={idx} className="hover:bg-white/[0.02]">
                            <td className="px-5 py-3 font-mono-nums text-[#52525b]">
                              {(idx + 1).toString().padStart(2, '0')}
                            </td>
                            <td className="px-5 py-3 text-right font-mono-nums text-white">
                              {rep.avgVelocity.toFixed(2)}
                            </td>
                            <td className="px-5 py-3 text-right font-mono-nums text-[#a1a1aa]">
                              {(rep.peakVelocity || rep.avgVelocity).toFixed(2)}
                            </td>
                            <td className="px-5 py-3 text-right font-mono-nums text-[#52525b]">
                              {(rep.duration || 0).toFixed(2)}s
                            </td>
                            <td className={`px-5 py-3 text-right font-mono-nums ${isFatigued ? 'text-[#52525b]' : 'text-white'}`}>
                              {percentOfBest.toFixed(0)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-16">
              <div className="text-5xl font-extralight text-[#1a1a1a] mb-4">No Rep Data</div>
              <p className="text-[#52525b] text-sm">
                This set was logged manually without velocity tracking.
              </p>
              {avgVelocity > 0 && (
                <div className="mt-8 inline-block bg-white/5 border border-white/10 rounded-2xl px-8 py-6">
                  <div className="text-3xl font-extralight font-mono-nums text-white">{avgVelocity.toFixed(2)}</div>
                  <div className="text-[10px] text-[#52525b] tracking-widest uppercase mt-2">Avg Velocity (m/s)</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
