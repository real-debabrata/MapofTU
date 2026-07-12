/**
 * Tripura University Interactive Campus Map - Routing Optimizer System
 */
(function() {
    'use strict';

    const RoutingEngine = {
        activeRouteLine: null,
        
        // Campus Spatial Graph Nodes
        networkNodes: {
            "node_main_gate": { coords: [23.7548, 91.2588], label: "Main Campus Entrance", accessible: true },
            "node_admin": { coords: [23.7570, 91.2595], label: "Administrative Block Junction", accessible: true },
            "node_library": { coords: [23.7585, 91.2612], label: "Central Library Quad", accessible: true },
            "node_science": { coords: [23.7605, 91.2625], label: "Science Block Plaza", accessible: true },
            "node_health": { coords: [23.7580, 91.2600], label: "Health Center Entrance", accessible: true }
        },

        // Map Edges with weights (Euclidean meters) and accessibility tags
        networkEdges: [
            { source: "node_main_gate", target: "node_admin", weight: 260, stepText: "Walk straight north along University Highway Avenue.", accessible: true },
            { source: "node_admin", target: "node_health", weight: 120, stepText: "Turn left at the medical link pathway.", accessible: true },
            { source: "node_health", target: "node_library", weight: 140, stepText: "Continue past health wing towards Central Library.", accessible: false }, // Simulating barrier (e.g. stairs)
            { source: "node_admin", target: "node_library", weight: 230, stepText: "Head northeast from the main administration courtyard.", accessible: true },
            { source: "node_library", target: "node_science", weight: 260, stepText: "Walk north towards Academic Building 11.", accessible: true }
        ],

        calculateRoute(startCoords, endCoords, accessibleOnly = false) {
            const startNodeId = this.findNearestNetworkNode(startCoords);
            const endNodeId = this.findNearestNetworkNode(endCoords);

            const path = this.solveDijkstra(startNodeId, endNodeId, accessibleOnly);
            
            if (!path || path.length < 2) {
                return null;
            }

            return this.buildRoutePayload(path);
        },

        findNearestNetworkNode(coords) {
            let minDistance = Infinity;
            let nearestId = null;

            for (const [id, node] of Object.entries(this.networkNodes)) {
                const distance = this.getDistanceMeters(coords, node.coords);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestId = id;
                }
            }
            return nearestId;
        },

        solveDijkstra(start, target, accessibleOnly) {
            const distances = {};
            const previous = {};
            let nodes = new Set();

            for (const nodeId in this.networkNodes) {
                distances[nodeId] = Infinity;
                previous[nodeId] = null;
                nodes.add(nodeId);
            }
            distances[start] = 0;

            while (nodes.size > 0) {
                let smallestNode = null;
                for (const node of nodes) {
                    if (smallestNode === null || distances[node] < distances[smallestNode]) {
                        smallestNode = node;
                    }
                }

                if (smallestNode === null || distances[smallestNode] === Infinity) {
                    break;
                }

                if (smallestNode === target) {
                    const path = [];
                    let temp = target;
                    while (temp) {
                        path.unshift(temp);
                        temp = previous[temp];
                    }
                    return path;
                }

                nodes.delete(smallestNode);

                const activeEdges = this.networkEdges.filter(e => 
                    (e.source === smallestNode || e.target === smallestNode) && 
                    (!accessibleOnly || e.accessible)
                );

                for (const edge of activeEdges) {
                    const neighbor = edge.source === smallestNode ? edge.target : edge.source;
                    if (!nodes.has(neighbor)) continue;

                    const alternativePathVal = distances[smallestNode] + edge.weight;
                    if (alternativePathVal < distances[neighbor]) {
                        distances[neighbor] = alternativePathVal;
                        previous[neighbor] = smallestNode;
                    }
                }
            }

            return null;
        },

        buildRoutePayload(pathNodeIds) {
            const coordinates = [];
            const steps = [];
            let totalDistance = 0;

            for (let i = 0; i < pathNodeIds.length; i++) {
                const currNode = this.networkNodes[pathNodeIds[i]];
                coordinates.push(currNode.coords);

                if (i < pathNodeIds.length - 1) {
                    const nextNodeId = pathNodeIds[i + 1];
                    const edge = this.networkEdges.find(e => 
                        (e.source === pathNodeIds[i] && e.target === nextNodeId) ||
                        (e.target === pathNodeIds[i] && e.source === nextNodeId)
                    );
                    if (edge) {
                        totalDistance += edge.weight;
                        steps.push({
                            instruction: edge.stepText,
                            distance: edge.weight
                        });
                    }
                }
            }

            const estimatedTimeMinutes = Math.max(1, Math.round(totalDistance / 80)); // ~4.8 km/h typical campus walking speed

            return {
                coordinates,
                steps,
                distance: totalDistance,
                duration: estimatedTimeMinutes
            };
        },

        drawRouteOnMap(map, coordinates) {
            this.clearRouteFromMap(map);

            this.activeRouteLine = L.polyline(coordinates, {
                color: '#10b981',
                weight: 6,
                opacity: 0.9,
                lineJoin: 'round',
                dashArray: '1, 10',
                animate: true
            }).addTo(map);

            // Zoom map view to show the entire calculated route line
            map.fitBounds(this.activeRouteLine.getBounds(), { padding: [50, 50] });
        },

        clearRouteFromMap(map) {
            if (this.activeRouteLine) {
                map.removeLayer(this.activeRouteLine);
                this.activeRouteLine = null;
            }
        },

        getDistanceMeters(c1, c2) {
            // Simplified Great-Circle distance formula
            const R = 6371000;
            const dLat = (c2[0] - c1[0]) * Math.PI / 180;
            const dLng = (c2[1] - c1[1]) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(c1[0] * Math.PI / 180) * Math.cos(c2[0] * Math.PI / 180) *
                      Math.sin(dLng/2) * Math.sin(dLng/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        }
    };

    window.CampusMap = window.CampusMap || {};
    window.CampusMap.RoutingEngine = RoutingEngine;
})();