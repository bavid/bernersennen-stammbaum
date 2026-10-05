import FilterChips from '../FilterChips.jsx'
import useGroupParam from '../../hooks/useGroupParam.js'

// Chips über „Neue Erinnerungen“ auf Start: „Alle · Mein Zuhause · Familie Sonnenhang · Zuhause Möwenweg“ - derselbe Weg wie
// über dem Tier-Raster (FilterChips, ?gruppe= über useGroupParam). options: aus lib/startFilter.js areaOptions (leer, wenn
// es nur ein Zuhause gibt - dann steht hier nichts). controls: die Id der Liste, die gefiltert wird.
export default function StartAreaFilter({ options, controls }) {
  const [requested, select] = useGroupParam()
  if (!options?.length) return null
  const current = options.some((option) => option.param === requested) ? requested : null
  return <FilterChips options={options} current={current} onSelect={select} controls={controls} label="Erinnerungen nach Zuhause" />
}
