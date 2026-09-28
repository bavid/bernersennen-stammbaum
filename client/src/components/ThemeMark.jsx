import { useTheme } from '../themes/ThemeProvider.jsx'

// Das Logo des aktuellen Auftritts (Pfote oder Berner-Wappen)
export default function ThemeMark(props) {
  const { theme } = useTheme()
  const Mark = theme.Mark
  return <Mark {...props} />
}
