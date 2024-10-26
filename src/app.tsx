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
        
        // Generate heavy and moderate traffic points
        const {heavy, moderate} = generateTrafficPoints(data);
        setTrafficPoints([...heavy, ...moderate]);
      });
  }, []);
  

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

function generateTrafficPoints(data: GeoJSON): {heavy: number[][]; moderate: number[][]} {
  const coordinates: number[][] = [];
  data.features.forEach((feature: Feature) => {
      if (feature.geometry.type === 'LineString') {
          coordinates.push(...feature.geometry.coordinates);
      }
  });

  // Define heavy traffic points at the top and bottom
  const top = coordinates[0]; 
  const bottom = coordinates[coordinates.length - 1]; 
  const heavyTrafficPoints = [
      randomPointAround(top, 100),
      randomPointAround(bottom, 100)
  ];

  // Define two moderate traffic points at random roads
  const moderateTrafficPoints = [
      randomPointAround(coordinates[Math.floor(Math.random() * coordinates.length)], 50),
      randomPointAround(coordinates[Math.floor(Math.random() * coordinates.length)], 50)
  ];

  return {heavy: heavyTrafficPoints, moderate: moderateTrafficPoints};
}

function randomPointAround([lon, lat]: number[], radius: number): number[] {
  const r = radius / 111300;  // Approx radius in degrees
  const u = Math.random();
  const v = Math.random();
  const w = r * Math.sqrt(u);
  const t = 2 * Math.PI * v;
  const x = w * Math.cos(t);
  const y = w * Math.sin(t);

  return [lon + x, lat + y];
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
function generateRandomPoints(data: GeoJSON, numPoints: number): number[][] {
  const coordinates: number[][] = [];

  data.features.forEach((feature: Feature) => {
    if (feature.geometry.type === 'LineString') {
      coordinates.push(...feature.geometry.coordinates);
    }
  });

  const randomPoints: number[][] = [];
  for (let i = 0; i < numPoints; i++) {
    const randomIndex = Math.floor(Math.random() * coordinates.length);
    randomPoints.push(coordinates[randomIndex]);
  }

  return randomPoints;
}

// Function to calculate the traffic color based on the distance from the closest traffic point
function getTrafficColor(roadCoords: number[], trafficPoints: {heavy: number[][], moderate: number[][]}) {
  const heavyDistances = trafficPoints.heavy.map(tp => haversineDistance(tp, roadCoords));
  const moderateDistances = trafficPoints.moderate.map(tp => haversineDistance(tp, roadCoords));
  const minHeavyDistance = Math.min(...heavyDistances);
  const minModerateDistance = Math.min(...moderateDistances);

  const maxDistance = 300;  // Distance beyond which color will be fully green

  if (minHeavyDistance < maxDistance) {
      return getRoadColor(100);  // Red for heavy traffic
  } else if (minModerateDistance < maxDistance) {
      return getRoadColor(50);  // Yellow for moderate traffic
  }

  return getRoadColor(0);  // Green for low traffic
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

function generateTrafficLights(intersections: number[][], data: GeoJSON): number[][] {
  const lights: number[][] = [];
  intersections.forEach(intersection => {
      const connectingRoads = data.features.filter((feature: Feature) => 
          feature.geometry.type === 'LineString' &&
          feature.geometry.coordinates.some(coord => haversineDistance(coord, intersection) < 5)
      );

      connectingRoads.forEach(road => {
          const nearestPoint = road.geometry.coordinates.reduce((closest, current) => 
              haversineDistance(current, intersection) < haversineDistance(closest, intersection) ? current : closest
          );
          lights.push(nearestPoint);  // Add a light at the connecting point
      });
  });
  return lights;
}


function getDeckGlLayers(data: GeoJSON | null, intersections: number[][], trafficPoints: {heavy: number[][], moderate: number[][]}) {
  if (!data) return [];

  const trafficLights = generateTrafficLights(intersections, data);

  return [
      new GeoJsonLayer({
          id: 'geojson-layer',
          data,
          stroked: true,
          filled: true,
          extruded: false,
          lineWidthScale: 2,
          lineWidthMinPixels: 1,
          getFillColor: [160, 160, 180, 200],
          getLineColor: (f: Feature) => {
              return getTrafficColor(f.geometry.coordinates[0], trafficPoints);
          },
          getPointRadius: 200,
          getLineWidth: 2,
          getElevation: 0
      }),
      new ScatterplotLayer({
          id: 'scatterplot-layer',
          data: intersections,
          getPosition: d => d,
          getRadius: 3,
          getFillColor: [255, 0, 0], // Red for intersections
          pickable: true
      }),
      new ScatterplotLayer({
          id: 'traffic-layer',
          data: [...trafficPoints.heavy, ...trafficPoints.moderate],
          getPosition: d => d,
          getRadius: 5,
          getFillColor: [0, 0, 255], // Blue for traffic points
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
