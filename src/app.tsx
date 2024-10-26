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
  const [intersections, setIntersections] = useState<number[][]>([]);
  const [trafficPoints, setTrafficPoints] = useState<number[][]>([]);
  const [totalRoads, setTotalRoads] = useState(0);
const [totalIntersections, setTotalIntersections] = useState(0);

const floatingTextStyle = {
  position: 'fixed',
  bottom: '10px',
  left: '50%',
  transform: 'translateX(-50%)',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  color: 'white',
  padding: '10px',
  borderRadius: '5px',
  zIndex: 1000,
  fontSize: '14px',
  textAlign: 'center',
};



useEffect(() => {
  fetch(DATA_URL)
    .then(res => res.json())
    .then(data => {
      setData(data as GeoJSON);
      const rawIntersections = findIntersections(data);
      const filteredIntersections = filterCloseIntersections(rawIntersections, 50);

      setIntersections(filteredIntersections);
      setTotalIntersections(filteredIntersections.length);

      // Calculate total number of roads
      const roadCount = data.features.filter(
        (feature) => feature.geometry.type === 'LineString'
      ).length;
      setTotalRoads(roadCount); // Set total roads count

      // Generate traffic points
      const heavyTrafficPoints = generateRandomPoints(data, 2, 300);
      const moderateTrafficPoints = generateRandomPoints(data, 2, 150);
      setTrafficPoints([...heavyTrafficPoints, ...moderateTrafficPoints]);
    });
}, []);


  

  return (
    <>
    
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
      <div style={floatingTextStyle}>
  Total Roads: {totalRoads} | Total Intersections: {totalIntersections}
</div>
    </>
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
          intersections.push(coord);
        } else {
          points[key] = coord;
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
  return R * c;
}

// Function to filter intersections within 50m radius
function filterCloseIntersections(points: number[][], minDistance: number) {
  const filtered: number[][] = [];

  points.forEach(point => {
    const isTooClose = filtered.some(existingPoint =>
      haversineDistance(existingPoint, point) < minDistance
    );
    
    if (!isTooClose) {
      filtered.push(point);
    }
  });

  return filtered;
}

// Function to generate random points that are not within maxDistance of each other, this is for the traffic simulation
function generateRandomPoints(data: GeoJSON, numPoints: number, maxDistance: number): number[][] {
  const coordinates: number[][] = [];
  const randomPoints: number[][] = [];

  data.features.forEach((feature: Feature) => {
    if (feature.geometry.type === 'LineString') {
      coordinates.push(...feature.geometry.coordinates);
    }
  });

  
  while (randomPoints.length < numPoints) {
    const randomIndex = Math.floor(Math.random() * coordinates.length);
    const candidatePoint = coordinates[randomIndex];
    
    
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
  // Calculate the distance between the road coordinates and each traffic point
  const distances = trafficPoints.map(tp => haversineDistance(tp, roadCoords));

  // Find the minimum distance from the road to any traffic point
  const minDistance = Math.min(...distances);

  // Normalize the distance to get a traffic value between 0 and 100
  const maxDistance = 300; // Max distance to normalize
  const trafficValue = Math.max(0, 100 - (minDistance / maxDistance) * 100);

  // Return the traffic color based on the traffic value
  return getRoadColor(trafficValue);
}


// Function to interpolate colors between green and red based on traffic value (0-100)
function getRoadColor(value: number) {
  const t = value / 100;
  return [
    Math.floor(255 * t),
    Math.floor(255 * (1 - t)), 
    0 
  ];
}


// Function to calculate traffic light ratio for intersections
function calculateTrafficLightRatio(intersection: number[], trafficPoints: number[][]) {
  
  const verticalAxisPoints = trafficPoints.filter(([x, y]) => Math.abs(x - intersection[0]) < 0.0005); 
  const horizontalAxisPoints = trafficPoints.filter(([x, y]) => Math.abs(y - intersection[1]) < 0.0005); 
  
  const verticalAxisScore = verticalAxisPoints.length;
  const horizontalAxisScore = horizontalAxisPoints.length;
  
  const totalScore = verticalAxisScore + horizontalAxisScore;

  //edge case 
  if (totalScore === 0) {
    return { vertical: 50, horizontal: 50 };
  }

  // Calculate base ratio for each axis based on total score
  let verticalRatio = (verticalAxisScore / totalScore) * 100;
  let horizontalRatio = (horizontalAxisScore / totalScore) * 100;

  // If scores are equal, set to 50-50
  if (verticalAxisScore === horizontalAxisScore) {
    verticalRatio = 50;
    horizontalRatio = 50;
  } else {
    // Ensure maximum ratio on one axis is capped at 90%
    if (verticalRatio > 90) verticalRatio = 90;
    if (horizontalRatio > 90) horizontalRatio = 90;

    // Adjust the other ratio accordingly (total must equal 100%)
    verticalRatio = Math.min(verticalRatio, 90);
    horizontalRatio = 100 - verticalRatio;
  }


  verticalRatio = Math.max(10, Math.min(90, verticalRatio));
  horizontalRatio = 100 - verticalRatio;

  // Log the calculated ratios
  console.log(`Intersection at (${intersection[0]}, ${intersection[1]}): Vertical Axis Ratio: ${verticalRatio}%, Horizontal Axis Ratio: ${horizontalRatio}%`);

  return { vertical: verticalRatio, horizontal: horizontalRatio };
}




function getDeckGlLayers(data: GeoJSON | null, intersections: number[][], trafficPoints: number[][]) {
  if (!data) return [];

  // Log traffic light ratios for each intersection
  intersections.forEach(intersection => {
    calculateTrafficLightRatio(intersection, trafficPoints);
  });

  return [
    new GeoJsonLayer({
      id: 'geojson-layer',
      data,
      stroked: true, 
      filled: true,
      extruded: false, 
      pointType: 'circle',
      lineWidthScale: 2,
      lineWidthMinPixels: 1,
      getFillColor: [160, 160, 180, 200], 
      getLineColor: (f: Feature) => {
        if (!f.geometry.coordinates || f.geometry.coordinates.length === 0) return [255, 255, 255];
        return getTrafficColor(f.geometry.coordinates[0], trafficPoints);
      },
      getPointRadius: 200,
      getLineWidth: 2, 
      getElevation: 0  
    }),

    // ScatterplotLayer for intersections
    new ScatterplotLayer({
      id: 'scatterplot-layer',
      data: intersections,
      getPosition: d => d, 
      getRadius: 3,
      getFillColor: [255, 0, 0], 
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
