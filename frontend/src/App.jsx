import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './components/HomePage'
import ThisWeekPage from './components/ThisWeekPage'
import WeekView from './components/WeekView'
import FavoritesPage from './components/FavoritesPage'
import GroceryListPage from './components/GroceryListPage'
import { HouseholdProvider, useHousehold } from './lib/household'

export default function App() {
  return (
    <HouseholdProvider>
      <Gate />
    </HouseholdProvider>
  )
}

function Gate() {
  const { loading, error } = useHousehold()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-400">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4 text-center">
        <div className="text-stone-500">
          This link isn&apos;t valid. Use the link from your weekly dinner ideas email to get here.
        </div>
      </div>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/this-week" element={<ThisWeekPage />} />
        <Route path="/week/:planId" element={<WeekView />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/grocery-list" element={<GroceryListPage />} />
      </Routes>
    </Layout>
  )
}
