import { useEffect } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import { MapPin } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Coordinates = { latitude: number; longitude: number }

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

function RecenterMap({ coordinates }: { coordinates: Coordinates }) {
  const map = useMap()

  useEffect(() => {
    map.setView([coordinates.latitude, coordinates.longitude])
  }, [coordinates, map])

  return null
}

export default function WeatherMap({ coordinates }: { coordinates: Coordinates }) {
  return (
    <>
      <MapContainer center={[coordinates.latitude, coordinates.longitude]} zoom={7} scrollWheelZoom className="map">
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[coordinates.latitude, coordinates.longitude]} icon={markerIcon} />
        <RecenterMap coordinates={coordinates} />
      </MapContainer>
      <div className="map-label"><MapPin size={13} /> Sua localização</div>
    </>
  )
}
