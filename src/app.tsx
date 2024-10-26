import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';

import {APIProvider, Map} from '@vis.gl/react-google-maps';

import {GeoJsonLayer, ScatterplotLayer} from '@deck.gl/layers/typed';
import {DeckGlOverlay} from './deckgl-overlay';

const DATA_URL = './data.geojson'; // Your GeoJSON data

import type {Feature, GeoJSON} from 'geojson';
import ControlPanel from './control-panel';

const API_KEY = "AIzaSyBRuzD0vjPUy4w3QIrZ_VODDuN_3yJyz60";

const App = () => {
  const [data, setData] = useState<GeoJSON | null>(null);
  const [intersections, setIntersections] = useState<number[][]>([]); // Store intersections
  const [trafficPoints, setTrafficPoints] = useState<number[][]>([]); // Store random traffic points

  useEffect(() => {
    fetch(DATA_URL)
      .then(res => res.json())
      .then(data => {
        setData(data as GeoJSON);
        const rawIntersections = findIntersections(data);
        const filteredIntersections = filterCloseIntersections(rawIntersections, 50); // Filter within 50m
        setIntersections(filteredIntersections);

        // Generate initial traffic points
        generateTrafficPoints(data);
      });
  }, []);

  useEffect(() => {
    // Set an interval to generate new traffic points every 5 seconds
    const interval = setInterval(() => {
      if (data) {
        console.log('Generating new traffic points at', new Date().toLocaleTimeString());
        generateTrafficPoints(data);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [data]);

  const generateTrafficPoints = (data: GeoJSON) => {
    // Generate 2 heavy and 2 moderate traffic points, ensuring they are spaced out by maxDistance
    const heavyTrafficPoints = generateRandomPoints(data, 2, 300); // Heavy traffic points with 300m spacing
    const moderateTrafficPoints = generateRandomPoints(data, 2, 150); // Moderate traffic points with 150m spacing
    setTrafficPoints([...heavyTrafficPoints, ...moderateTrafficPoints]);
  };

  return (
    <APIProvider apiKey={API_KEY}>
      <Map
        defaultCenter={{lat: 43.67, lng: -79.34}}
        defaultZoom={16}
        mapId={'4f6dde3310be51d7'}
        gestureHandling={'greedy'}
        disableDefaultUI={true}>
        <DeckGlOverlay layers={getDeckGlLayers(data, intersections, trafficPoints)} />
      </Map>
      <ControlPanel />
    </APIProvider>
  );
};

// Function to detect intersections
function findIntersections(data: GeoJSON): number[][] {
  const points: Record<string, number[]> = {};
  const intersections: number[][] = [];

  data.features.forEach((feature: Feature) => {
    if (feature.geometry.type === 'LineString') {
      feature.geometry.coordinates.forEach(coord => {
        const key = `${coord[0]},${coord[1]}`;
        if (points[key]) {
          intersections.push(coord); // If the coordinate exists, it's an intersection
        } else {
          points[key] = coord; // Store coordinate
        }
      });
    }
  });

  return intersections;
}

// Haversine formula to calculate the distance between two points in meters
function haversineDistance([lon1, lat1]: number[], [lon2, lat2]: number[]) {
  const R = 6371000; // Radius of the Earth in meters
  const rad = Math.PI / 180;
  
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}

// Function to filter intersections within 50m radius
function filterCloseIntersections(points: number[][], minDistance: number) {
  const filtered: number[][] = [];

  points.forEach(point => {
    const isTooClose = filtered.some(existingPoint =>
      haversineDistance(existingPoint, point) < minDistance
    );
    
    if (!isTooClose) {
      filtered.push(point); // Add point only if no existing point is within 50 meters
    }
  });

  return filtered;
}

// Function to generate random points within the valid road space
function generateRandomPoints(data: GeoJSON, numPoints: number, maxDistance: number): number[][] {
  const coordinates: number[][] = [];
  const randomPoints: number[][] = [];

  // Collect all road coordinates
  data.features.forEach((feature: Feature) => {
    if (feature.geometry.type === 'LineString') {
      coordinates.push(...feature.geometry.coordinates);
    }
  });

  // Generate random points, ensuring they are not too close to each other
  while (randomPoints.length < numPoints) {
    const randomIndex = Math.floor(Math.random() * coordinates.length);
    const candidatePoint = coordinates[randomIndex];
    
    // Check if this point is too close to any of the existing points
    const isTooClose = randomPoints.some(existingPoint => 
      haversineDistance(existingPoint, candidatePoint) < maxDistance
    );

    // Only add the candidate point if it's not too close
    if (!isTooClose) {
      randomPoints.push(candidatePoint);
    }
  }

  return randomPoints;
}

// Function to calculate the traffic color based on the distance from the closest traffic point
function getTrafficColor(roadCoords: number[], trafficPoints: number[][]) {
  const distances = trafficPoints.map(tp => haversineDistance(tp, roadCoords));
  const minDistance = Math.min(...distances); // Get the minimum distance to the traffic points

  // Normalize the distance to get a value between 0 (red) and 100 (green)
  const maxDistance = 300; // Arbitrary max distance to normalize (adjust as needed)
  const trafficValue = Math.max(0, 100 - (minDistance / maxDistance) * 100);

  return getRoadColor(trafficValue);
}

// Function to interpolate colors between green and red based on traffic value (0-100)
function getRoadColor(value: number) {
  const t = value / 100;
  return [
    Math.floor(255 * t),          // Red increases from 0 to 255
    Math.floor(255 * (1 - t)),    // Green decreases from 255 to 0
    0                             // Blue remains constant at 0
  ];
}

function getDeckGlLayers(data: GeoJSON | null, intersections: number[][], trafficPoints: number[][]) {
  if (!data) return [];

  return [
    // GeoJsonLayer for roads
    new GeoJsonLayer({
      id: 'geojson-layer',
      data,
      stroked: true,  // Enable stroke for road outlines
      filled: true,
      extruded: false, // Set to false if you don’t want 3D
      pointType: 'circle',
      lineWidthScale: 2,
      lineWidthMinPixels: 1,
      getFillColor: [160, 160, 180, 200],  // Default fill color
      getLineColor: (f: Feature) => {
        if (!f.geometry.coordinates || f.geometry.coordinates.length === 0) return [255, 255, 255];
        // Get the color based on proximity to traffic points
        return getTrafficColor(f.geometry.coordinates[0], trafficPoints);
      },
      getPointRadius: 200,
      getLineWidth: 2,  // Customize road line width
      getElevation: 0   // No elevation (for 2D roads)
    }),

    // ScatterplotLayer for intersections
    new ScatterplotLayer({
      id: 'scatterplot-layer',
      data: intersections,
      getPosition: d => d,  // Use the coordinates of the intersections
      getRadius: 3,  // Adjust marker sizes
      getFillColor: [255, 0, 0], // Red markers for intersections
      pickable: true
    })
  ];
}

export default App;

export function renderToDom(container: HTMLElement) {
  const root = createRoot(container);

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
