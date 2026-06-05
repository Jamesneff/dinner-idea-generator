import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './components/HomePage'
import WeekView from './components/WeekView'
import FavoritesPage from './components/FavoritesPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/week/:planId" element={<WeekView />} />
        <Route path="/favorites" element={<FavoritesPage />} />
      </Routes>
    </Layout>
  )
}
